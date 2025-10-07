// api/assistant.js - VERSÃO ENRIQUECIDA COM CONTEXTO COMPLETO

export const config = {
 runtime: 'edge',
 maxDuration: 30,
};

import PromptBuilder from './lib/promptBuilder.js';

// ============= CASOS DE ÊXITO REAIS VENTAPEL - VERSÃO AMPLIADA =============
const CASOS_EXITO_REAIS = {
 'honda': {
   empresa: 'Honda Argentina',
   setor: 'Automotivo',
   problema: 'Velocidade limitada, 1% perdas, problemas ergonômicos',
   solucao: 'BP555 + Fita Gorilla 300m',
   resultados: {
     velocidade: '+40%',
     perdas: '100% eliminadas',
     roi_meses: 3,
     investimento: 150000,
     economia_anual: 600000
   },
   tags: ['automotivo', 'concessionárias', 'alta-segurança', 'ergonomia', 'ruído-laboral', 'espaço-limitado'],
   metricas_detalhe: {
     funcionarios: '>1000',
     regiao: 'Argentina',
     melhoria_ergonomia: 'Permitiu diversidade de operadores',
     reducao_ruido: 'Significativa'
   }
 },
 
 'loreal': {
   empresa: "L'Oréal Brasil",
   setor: 'Cosmética',
   problema: '+10% perdas por roubo, gargalos de produção',
   solucao: 'RSA + Fita Gorilla 700m',
   resultados: {
     roubos: '100% eliminados',
     eficiencia: '+50%',
     roi_meses: 3,
     investimento: 280000,
     economia_anual: 2500000,
     capacidade: '12 caixas/minuto',
     rastreabilidade: '100% implementada'
   },
   tags: ['cosmética', 'alto-valor', 'anti-roubo', 'rastreabilidade', 'ROI-rápido', 'espaço-limitado'],
   metricas_detalhe: {
     funcionarios: '>5000',
     regiao: 'Brasil',
     volume: 'Alto volume diário',
     espaco: 'Sem possibilidade de expansão'
   }
 },
 
 'nike': {
   empresa: 'Nike Brasil',
   setor: 'Calçado/Têxtil',
   problema: '10% perdas em transporte',
   solucao: 'BP755 + Fita Gorilla 300m',
   resultados: {
     perdas: '100% eliminadas',
     eficiencia: '+30%',
     roi_meses: 2,
     investimento: 200000,
     economia_anual: 1200000,
     disputas: '100% redução com transportadoras'
   },
   tags: ['têxtil', 'calçado', 'e-commerce', 'transportadoras', 'saúde-ocupacional', 'ROI-rápido'],
   metricas_detalhe: {
     funcionarios: '>3000',
     regiao: 'Brasil',
     problema_saude: 'Dores em operadores eliminadas',
     controle_visual: 'Melhorado imediatamente'
   }
 },
 
 'mercadolibre': {
   empresa: 'MercadoLibre',
   setor: 'E-commerce',
   problema: 'Alto retrabalho, perdas em fulfillment',
   solucao: 'BP555e + Fita VENOM',
   resultados: {
     retrabalho: '-100%',
     economia_mensal: 180000,
     roi_meses: 2,
     investimento: 360000
   },
   tags: ['e-commerce', 'marketplace', 'fulfillment', 'alto-volume'],
   metricas_detalhe: {
     tipo_operacao: 'Centro de fulfillment',
     picos: 'Sazonais significativos'
   }
 },

'correio_argentino': {
  empresa: 'Correo Argentino',
  setor: 'Logística/Postal',
  problema: 'Roubos de celulares em trânsito, departamento de segurança questionava a fita gomada por possível violação sem evidência',
  solucao: 'BP555e + Fita VENOM + protocolo de fechamento padronizado + processo de verificação imediata',
  resultados: {
    roubos: 'Detecção imediata de violações',
    evidencia: '100% rastreabilidade de abertura',
    processo: 'Padronização completa do fechamento',
    roi_meses: 2,
    investimento: 180000
  },
  tags: ['logística', 'postal', 'anti-roubo', 'celulares', 'alta-segurança', 'rastreabilidade', 'protocolo'],
  metricas_detalhe: {
    regiao: 'Argentina',
    tipo_carga: 'Celulares e eletrônicos',
    solucao_chave: 'Protocolo de detecção: cliente reporta imediatamente qualquer anomalia em peso ou aparência',
    melhoria_processo: 'Fechamento padronizado permite detecção visual imediata de violação',
    departamento_envolvido: 'Segurança e prevenção de roubos'
  },
  aprendizado_chave: 'A fita gomada SEMPRE deixa evidência de violação. O êxito depende de: 1) Padronizar o método de fechamento, 2) Treinar o receptor para detectar anomalias, 3) Protocolo de reporte imediato'
}
};

// ============= MÉTRICAS AGREGADAS PARA BENCHMARKING =============
const METRICAS_BENCHMARK = {
 roi_por_setor: {
   'Cosmética/Alto valor': { min: 2, max: 3, media: 2.5 },
   'E-commerce/Fulfillment': { min: 0, max: 2, media: 1 },
   'Automotivo': { min: 2, max: 4, media: 3 },
   'Alimentos frescos': { min: 6, max: 12, media: 9 },
   'Logística/3PL': { min: 2, max: 3, media: 2.5 }
 },
 
 melhorias_produtividade: {
   'automacao_completa': { min: 50, max: 100, media: 75 },
   'semi_automacao': { min: 30, max: 50, media: 40 },
   'melhorias_ergonomicas': { min: 20, max: 40, media: 30 }
 },
 
 reducao_perdas: {
   'roubos_furtos': { min: 90, max: 100, media: 100 },
   'danos_transporte': { min: 90, max: 100, media: 95 },
   'disputas_transportadoras': { min: 80, max: 100, media: 90 }
 },
 
 investimento_por_tamanho: {
   'pequeno': { min: 150000, max: 300000, estacoes: '1-5' },
   'medio': { min: 300000, max: 600000, estacoes: '5-20' },
   'grande': { min: 600000, max: 2500000, estacoes: '20+' }
 }
};

// ============= HELPERS =============
function getScaleValue(scale) {
 if (!scale) return 0;
 if (typeof scale === 'object' && scale.score !== undefined) return scale.score;
 if (typeof scale === 'number') return scale;
 return 0;
}

// NOVA FUNÇÃO: Extrair descrição da escala
function getScaleDescription(scale) {
  if (!scale) return '';
  if (typeof scale === 'object' && scale.description !== undefined) {
    return scale.description || '';
  }
  return '';
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

// ============= FUNÇÃO MELHORADA PARA BUSCAR CASOS RELEVANTES =============
function findRelevantCases(opportunity) {
 if (!opportunity) return [];
 
 const relevantCases = [];
 const oppTags = [];
 
 // Gerar tags da oportunidade atual - ENRIQUECIDA com novos campos
 if (opportunity.industry) {
   oppTags.push(opportunity.industry.toLowerCase());
 }
 if (opportunity.product) {
   // Adicionar tags baseadas no produto
   if (opportunity.product.toLowerCase().includes('bp')) oppTags.push('máquina');
   if (opportunity.product.toLowerCase().includes('fita')) oppTags.push('fita');
   if (opportunity.product.toLowerCase().includes('venom')) oppTags.push('anti-roubo');
 }
 if (opportunity.value > 500000) {
   oppTags.push('enterprise', 'alto-volume');
 }
 if (opportunity.scales?.dor?.description?.includes('roubo')) {
   oppTags.push('anti-roubo');
 }
 if (opportunity.scales?.dor?.description?.includes('ergon')) {
   oppTags.push('ergonomia');
 }
 
 // Buscar casos com tags coincidentes
 Object.entries(CASOS_EXITO_REAIS).forEach(([key, caso]) => {
   let score = 0;
   
   // Coincidência por setor
   if (caso.setor.toLowerCase().includes(opportunity.industry?.toLowerCase() || '')) {
     score += 3;
   }
   
   // Coincidência por tags
   if (caso.tags) {
     caso.tags.forEach(tag => {
       if (oppTags.includes(tag)) {
         score += 1;
       }
     });
   }
   
   // Coincidência por problema similar
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
 
 // Ordenar por relevância e retornar top 3
 return relevantCases
   .sort((a, b) => b.score - a.score)
   .slice(0, 3);
}

// ============= MOTOR DE ANÁLISE DO PIPELINE =============
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
 
 // Oportunidades em risco (health < 4 ou sem contato > 7 dias)
 const riskOpps = opportunities.filter(opp => {
   const health = parseFloat(calculateHealthScore(opp.scales));
   const daysSince = getDaysSinceLastContact(opp.last_update);
   return health < 4 || daysSince > 7;
 });

 // Top deals para fechar este mês
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
     action: deal.stage === 5 ? 'FECHAR JÁ' : 'Acelerar fechamento'
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

 // Calcular médias
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

// ============= ANÁLISE DE OPORTUNIDADE INDIVIDUAL - ENRIQUECIDA =============
function analyzeOpportunity(opportunity) {
 if (!opportunity) return null;

 const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
 const daysSince = getDaysSinceLastContact(opportunity.last_update);
 
 // Calcular probabilidade baseada em escalas
 let probability = 0;
 if (healthScore >= 8) probability = 85;
 else if (healthScore >= 7) probability = 70;
 else if (healthScore >= 5) probability = 40;
 else if (healthScore >= 3) probability = 20;
 else probability = 5;

 // Ajustar por dias sem contato
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

 // NOVO: Coletar descrições das escalas
 const scaleDescriptions = {
   dor: getScaleDescription(scales.dor || scales.pain),
   poder: getScaleDescription(scales.poder || scales.power),
   visao: getScaleDescription(scales.visao || scales.vision),
   valor: getScaleDescription(scales.valor || scales.value),
   controle: getScaleDescription(scales.controle || scales.control),
   compras: getScaleDescription(scales.compras || scales.purchase)
 };

 if (dorScore < 5) {
   criticalScales.push({
     name: 'DOR',
     value: dorScore,
     issue: 'Cliente não admite o problema',
     action: 'Aplicar técnica SPIN para elevar dor',
     description: scaleDescriptions.dor
   });
 }
 if (poderScore < 4) {
   criticalScales.push({
     name: 'PODER',
     value: poderScore,
     issue: 'Sem acesso ao decisor',
     action: opportunity.power_sponsor 
       ? `Conseguir reunião com ${opportunity.power_sponsor}` 
       : 'Identificar e acessar o Power Sponsor',
     description: scaleDescriptions.poder
   });
 }
 if (visaoScore < 4) {
   criticalScales.push({
     name: 'VISÃO',
     value: visaoScore,
     issue: 'Cliente não vê a solução',
     action: 'Demo com caso de êxito relevante',
     description: scaleDescriptions.visao
   });
 }
 if (valorScore < 4) {
   criticalScales.push({
     name: 'VALOR',
     value: valorScore,
     issue: 'ROI não percebido',
     action: 'Calcular e apresentar ROI específico',
     description: scaleDescriptions.valor
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
   },
   scaleDescriptions, // NOVO: Descrições das escalas
   contacts: { // NOVO: Mapa de contatos
     power_sponsor: opportunity.power_sponsor,
     sponsor: opportunity.sponsor,
     influencer: opportunity.influencer,
     support_contact: opportunity.support_contact
   },
   product: opportunity.product, // NOVO: Produto
   next_action: opportunity.next_action, // NOVO: Próxima ação
   expected_close: opportunity.expected_close // NOVO: Fechamento esperado
 };
}

// ============= GERAÇÃO DE ALERTAS INTELIGENTES - ENRIQUECIDA =============
function generateAlerts(opportunity, pipelineContext) {
 const alerts = [];
 if (!opportunity) return alerts;

 const daysSince = getDaysSinceLastContact(opportunity.last_update);
 const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
 const scales = opportunity.scales || {};

 // Alerta por dias sem contato - ENRIQUECIDO com nome do contato
 if (daysSince > 30) {
   const contactName = opportunity.sponsor || opportunity.power_sponsor || 'o contato';
   alerts.push({
     type: 'critical',
     priority: 1,
     message: `💀 NEGÓCIO MORTO: ${daysSince} dias sem falar com ${contactName}`,
     action: `Ligar HOJE para ${contactName} com oferta especial ou descartar`
   });
 } else if (daysSince > 14) {
   alerts.push({
     type: 'urgent',
     priority: 2,
     message: `🔴 URGENTE: ${daysSince} dias sem contato - Negócio esfriando`,
     action: opportunity.next_action || 'Email de reativação + ligação em 24h'
   });
 } else if (daysSince > 7) {
   alerts.push({
     type: 'warning',
     priority: 3,
     message: `⚠️ ATENÇÃO: ${daysSince} dias sem contato`,
     action: opportunity.next_action || 'Enviar email com novo caso de êxito'
   });
 }

 // NOVO: Alerta por fechamento próximo sem decisor
 if (opportunity.expected_close) {
   const daysToClose = Math.floor((new Date(opportunity.expected_close) - new Date()) / (1000 * 60 * 60 * 24));
   const poderScore = getScaleValue(scales.poder || scales.power);
   
   if (daysToClose <= 30 && poderScore < 5 && !opportunity.power_sponsor) {
     alerts.push({
       type: 'urgent',
       priority: 1,
       message: `⚡ Fechamento previsto em ${daysToClose} dias SEM ACESSO AO DECISOR`,
       action: 'URGENTE: Mapear e acessar Power Sponsor esta semana'
     });
   }
 }

 // Alerta por valor em risco - ENRIQUECIDO com nome do produto
 if (healthScore < 4 && opportunity.value > 100000) {
   const productInfo = opportunity.product ? ` (${opportunity.product})` : '';
   alerts.push({
     type: 'critical',
     priority: 1,
     message: `💣 R$ ${opportunity.value.toLocaleString('pt-BR')}${productInfo} EM RISCO CRÍTICO (Saúde: ${healthScore}/10)`,
     action: opportunity.power_sponsor 
       ? `Reunião de emergência com ${opportunity.power_sponsor} ou escalar para CEO`
       : 'Reunião de emergência com decisor ou escalar para CEO'
   });
 } else if (healthScore < 5 && opportunity.value > 50000) {
   alerts.push({
     type: 'urgent',
     priority: 2,
     message: `⚠️ Negócio de R$ ${opportunity.value.toLocaleString('pt-BR')} precisa de intervenção`,
     action: 'Plano de recuperação em 48h'
   });
 }

 // Alerta por inconsistência PPVVCC
 const dorScore = getScaleValue(scales.dor || scales.pain);
 const poderScore = getScaleValue(scales.poder || scales.power);
 
 if (opportunity.stage >= 3 && dorScore < 5) {
   alerts.push({
     type: 'warning',
     priority: 2,
     message: `⛔ FREIO: Na etapa '${opportunity.stage}' sem DOR confirmada (${dorScore}/10)`,
     action: 'Voltar para Qualificação - Não avançar sem dor'
   });
 }

 if (opportunity.stage >= 4 && poderScore < 4) {
   const contactToUse = opportunity.sponsor || opportunity.influencer || 'alguém interno';
   alerts.push({
     type: 'warning',
     priority: 2,
     message: `⛔ FREIO: Tentando fechar sem acesso ao PODER (${poderScore}/10)`,
     action: `Pedir para ${contactToUse} te apresentar ao decisor`
   });
 }

 // Alerta por oportunidade quente
 if (healthScore >= 8 && opportunity.stage < 5) {
   alerts.push({
     type: 'opportunity',
     priority: 3,
     message: `🔥 OPORTUNIDADE: Negócio quente (${healthScore}/10) - Acelerar fechamento`,
     action: 'Propor contrato esta semana'
   });
 }

 // NOVO: Alerta baseado na próxima ação registrada
 if (opportunity.next_action && daysSince > 2) {
   alerts.push({
     type: 'warning',
     priority: 3,
     message: `📅 Ação pendente: "${opportunity.next_action}"`,
     action: 'Executar ação registrada ou atualizar plano'
   });
 }

 // Ordenar por prioridade
 return alerts.sort((a, b) => a.priority - b.priority);
}

// ============= NEXT BEST ACTION INTELIGENTE - ENRIQUECIDA =============
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

 // NOVO: Usar o nome real dos contatos quando disponível
 const contactName = opportunity.sponsor || 'o contato';
 const decisionMaker = opportunity.power_sponsor || 'o decisor';

 // Prioridade 1: Negócios mortos
 if (daysSince > 30) {
   return {
     priority: 'CRÍTICA',
     title: '💀 NEGÓCIO MORTO - Última oportunidade',
     action: `Ligação de resgate HOJE para ${contactName}`,
     strategy: 'Criar urgência com oferta limitada',
     script: `"${contactName}, faz ${daysSince} dias que não conversamos. Tenho uma oferta especial de 20% de desconto válida apenas esta semana. 15 minutos hoje para você ver?"`,
     expectedOutcome: 'Reativar ou descartar definitivamente'
   };
 }

 // NOVO: Se há próxima ação registrada e não foi executada
 if (opportunity.next_action && daysSince > 2) {
   return {
     priority: 'ALTA',
     title: '📋 Executar ação planejada',
     action: opportunity.next_action,
     strategy: 'Manter compromissos e momentum',
     script: `Execute: "${opportunity.next_action}" conforme combinado`,
     expectedOutcome: 'Manter credibilidade e avançar processo'
   };
 }

 // Prioridade 2: Negócios frios
 if (daysSince > 7) {
   return {
     priority: 'URGENTE',
     title: `🔴 ${daysSince} dias sem contato - Reativar JÁ`,
     action: `Email + Ligação em 2 horas para ${contactName}`,
     strategy: 'Usar concorrência ou perda como gatilho',
     script: `ASSUNTO: "${opportunity.client} - Vocês ainda estão perdendo R$ ${Math.round(opportunity.value * 0.15).toLocaleString('pt-BR')}/mês?"\n\nCONTEÚDO: "Vi que ${opportunity.competitor || 'seu concorrente'} já implementou nossa solução. Vale 15 minutos para ver os resultados?"`,
     expectedOutcome: 'Reunião agendada em 48h'
   };
 }

 // Prioridade 3: Sem dor admitida
 if (dorScore < 5) {
   const dorDescription = getScaleDescription(scales.dor || scales.pain);
   return {
     priority: 'ALTA',
     title: '🎯 Sem DOR = Sem venda',
     action: `Sessão SPIN profunda com ${contactName}`,
     strategy: dorDescription ? `Explorar: "${dorDescription}"` : 'Quantificar perdas ocultas',
     script: `"${opportunity.client}, com seu volume de ${Math.round(opportunity.value/100)} caixas/mês, quanto lhes custa cada caixa que se abre em trânsito? E o tempo de retrabalho?"`,
     expectedOutcome: 'Dor admitida e quantificada'
   };
 }

 // Prioridade 4: Sem acesso ao poder
 if (poderScore < 4) {
   const sponsor = opportunity.sponsor || contactName;
   return {
     priority: 'ALTA',
     title: '👑 Você precisa do DECISOR',
     action: opportunity.power_sponsor 
       ? `Agendar reunião com ${opportunity.power_sponsor} esta semana`
       : 'Mapear e acessar o Power Sponsor',
     strategy: `Fazer ${sponsor} ser o herói`,
     script: `"${sponsor}, para garantir o ROI de R$ ${Math.round(opportunity.value * 2.5).toLocaleString('pt-BR')}/ano, preciso que me ajude a preparar os números para ${decisionMaker}. Apresentamos juntos?"`,
     expectedOutcome: 'Reunião com decisor em 7 dias'
   };
 }

 // Prioridade 5: Sem visão clara
 if (visaoScore < 5) {
   const productFocus = opportunity.product || 'nossa solução completa';
   return {
     priority: 'MÉDIA',
     title: '👁️ Construir VISÃO da solução',
     action: `Demo personalizada de ${productFocus}`,
     strategy: 'Mostrar o futuro sem os problemas atuais',
     script: `"Imagina sua operação sem caixas abertas, sem reclamações, com 30% menos tempo de fechamento. Vou te mostrar exatamente como conseguir isso com ${productFocus} no seu volume específico."`,
     expectedOutcome: 'Visão clara e diferenciada'
   };
 }

 // Prioridade 6: Sem valor percebido
 if (valorScore < 5) {
   return {
     priority: 'MÉDIA',
     title: '💰 Demonstrar ROI concreto',
     action: `Apresentar business case para ${decisionMaker}`,
     strategy: 'Números específicos do cliente',
     script: `"Preparei uma análise específica para ${opportunity.client}: investimento de R$ ${Math.round(opportunity.value * 0.5).toLocaleString('pt-BR')}, economia anual de R$ ${Math.round(opportunity.value * 1.8).toLocaleString('pt-BR')}. Revisamos juntos?"`,
     expectedOutcome: 'ROI validado e aceito'
   };
 }

 // Prioridade 7: Pronto para fechar
 if (dorScore >= 7 && poderScore >= 6 && valorScore >= 6 && controleScore >= 6) {
   const closer = opportunity.power_sponsor || opportunity.sponsor || 'o responsável';
   return {
     priority: 'OPORTUNIDADE',
     title: '🏆 FECHAR ESTA SEMANA',
     action: 'Pressionar para assinatura',
     strategy: 'Criar urgência positiva',
     script: `"${closer}, já validamos tudo: problema, solução e ROI. Posso começar a implementação segunda-feira. Assinamos hoje para aproveitar o desconto do mês?"`,
     expectedOutcome: 'Contrato assinado em 72h'
   };
 }

 // Default: Manter momentum
 return {
   priority: 'NORMAL',
   title: '📈 Manter momentum',
   action: 'Avançar metodologia',
   strategy: 'Próximo passo segundo PPVVCC',
   script: 'Revisar escalas e avançar a mais baixa',
   expectedOutcome: 'Progresso nas escalas'
 };
}

// ============= QUICK ACTIONS DINÂMICAS - ENRIQUECIDAS =============
function generateQuickActions(opportunity, alerts) {
 if (!opportunity) {
   return [
     {
       icon: '📊',
       label: 'Ver pipeline completo',
       prompt: 'Mostre uma análise do pipeline completo com oportunidades em risco',
       color: 'bg-blue-500'
     },
     {
       icon: '🏆',
       label: 'Top negócios para fechar',
       prompt: 'Quais são os 5 melhores negócios para fechar este mês?',
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

 // Ações baseadas em escalas baixas - ENRIQUECIDAS
 if (dorScore < 5) {
   const contactToAsk = opportunity.sponsor || opportunity.influencer || 'o contato';
   actions.push({
     icon: '🎯',
     label: 'Elevar dor',
     prompt: `Dê-me 5 perguntas SPIN específicas para que ${contactToAsk} de ${opportunity.client} admita suas perdas por caixas abertas e retrabalho`,
     color: 'bg-red-500'
   });
 }

 if (poderScore < 4) {
   const sponsor = opportunity.sponsor || 'meu contato';
   const powerSponsor = opportunity.power_sponsor || 'o decisor';
   actions.push({
     icon: '👑',
     label: 'Acessar decisor',
     prompt: `Script exato para pedir a ${sponsor} que me apresente a ${powerSponsor} de ${opportunity.client}`,
     color: 'bg-purple-500'
   });
 }

 if (valorScore < 5) {
   const product = opportunity.product || 'nossa solução';
   actions.push({
     icon: '💰',
     label: 'Calcular ROI',
     prompt: `Calcule o ROI específico de ${product} para ${opportunity.client} com volume de ${Math.round(opportunity.value/100)} caixas/mês`,
     color: 'bg-green-500'
   });
 }

 if (comprasScore < 4) {
   const procurement = opportunity.support_contact || 'o setor de compras';
   actions.push({
     icon: '📋',
     label: 'Navegar compras',
     prompt: `${opportunity.client} tem processo de compras complexo com ${procurement}. Dê-me estratégia para evitar cotação e acelerar aprovação`,
     color: 'bg-yellow-500'
   });
 }

 // Ações baseadas em alertas
 if (alerts && alerts.length > 0) {
   if (alerts[0].type === 'critical') {
     actions.push({
       icon: '🚨',
       label: 'Plano de resgate',
       prompt: `${opportunity.client} está em risco crítico. Dê-me um plano de resgate de emergência para salvar este negócio de R$ ${opportunity.value.toLocaleString('pt-BR')}`,
       color: 'bg-red-600'
     });
   } else if (alerts[0].type === 'urgent') {
     const contactName = opportunity.sponsor || opportunity.power_sponsor || 'o cliente';
     actions.push({
       icon: '📧',
       label: 'Email reativação',
       prompt: `Escreva um email poderoso para reativar ${contactName} de ${opportunity.client} depois de ${getDaysSinceLastContact(opportunity.last_update)} dias sem contato`,
       color: 'bg-orange-500'
     });
   }
 }

 // Ações gerais sempre disponíveis - ENRIQUECIDAS
 if (actions.length < 5) {
   actions.push({
     icon: '📊',
     label: 'Análise PPVVCC',
     prompt: `Análise completa PPVVCC de ${opportunity.client} com ações específicas para subir cada escala. Considere que estamos vendendo ${opportunity.product || 'solução de fechamento'}`,
     color: 'bg-indigo-500'
   });
 }

 if (actions.length < 6) {
   const product = opportunity.product || 'nossa solução';
   const contact = opportunity.sponsor || opportunity.power_sponsor || 'o cliente';
   actions.push({
     icon: '🎬',
     label: 'Preparar demo',
     prompt: `Como estruturo uma demo vencedora de ${product} para ${contact} de ${opportunity.client} em ${opportunity.industry || 'sua indústria'}?`,
     color: 'bg-blue-500'
   });
 }

 return actions.slice(0, 6);
}

// ============= CHAMADA À CLAUDE API MELHORADA - CONTEXTO COMPLETO =============
async function callClaudeAPI(opportunityData, userInput, ventapelContext, toolsAvailable, webSearchResults = null, completeAnalysis = null) {
 const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
 
 if (!ANTHROPIC_API_KEY) {
   console.log('⚠️ Claude API não configurada, usando análise local');
   return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
 }

 // Preparar casos relevantes como referência opcional
 const relevantCasesForReference = completeAnalysis?.relevantCases?.length > 0 
   ? completeAnalysis.relevantCases.map(c => ({
       empresa: c.empresa,
       problema: c.problema,
       roi_meses: c.resultados.roi_meses,
       metrica_chave: c.resultados.perdas || c.resultados.roubos || c.resultados.produtividade
     }))
   : [];

 const promptTemplate = `Você é "Ventus", um coach de vendas expert em metodologia PPVVCC da Ventapel Brasil.
Seu CEO te descreveu como: "direto, sem rodeios, baseado em evidência e lógica". NÃO use adulação nem frases motivacionais vazias.

**ESTRUTURA OBRIGATÓRIA DAS SUAS RESPOSTAS:**

1. **DIAGNÓSTICO** - O que está acontecendo realmente (análise da situação)
2. **ESTRATÉGIA** - Por que é importante agir (o princípio por trás)
3. **TÁTICA** - O que fazer especificamente (ações concretas)
4. **EVIDÊNCIA** - Só se aplicável, mencione UM caso relevante como prova (opcional)

**REGRAS CRÍTICAS:**
- NUNCA comece com "No caso da empresa X..." 
- PRIMEIRO explique O QUÊ fazer e POR QUÊ
- Os casos são EVIDÊNCIA OPCIONAL no final, não o ponto de partida
- Se mencionar um caso, que seja para reforçar credibilidade, não como receita
- Personalize TUDO ao contexto específico do cliente atual

---
**CONTEXTO ATUAL:**

Cliente: ${opportunityData?.client || 'Não selecionado'}
Indústria: ${opportunityData?.industry || 'Não especificada'}
Valor negócio: R$ ${opportunityData?.value?.toLocaleString('pt-BR') || '0'}
Etapa: ${opportunityData?.stage || 0}/6
Produto/Solução: ${opportunityData?.product || 'Não especificado'}

**ANÁLISE PPVVCC:**
${completeAnalysis?.opportunity ? `
- Score de Saúde: ${completeAnalysis.opportunity.healthScore}/10
- Probabilidade: ${completeAnalysis.opportunity.probability}%
- Dias sem contato: ${completeAnalysis.opportunity.daysSince}
- Escalas:
  • DOR: ${completeAnalysis.opportunity.scaleBreakdown.dor}/10
  • PODER: ${completeAnalysis.opportunity.scaleBreakdown.poder}/10
  • VISÃO: ${completeAnalysis.opportunity.scaleBreakdown.visao}/10
  • VALOR: ${completeAnalysis.opportunity.scaleBreakdown.valor}/10
  • CONTROLE: ${completeAnalysis.opportunity.scaleBreakdown.controle}/10
  • COMPRAS: ${completeAnalysis.opportunity.scaleBreakdown.compras}/10
` : 'Não disponível'}

**CONTEXTO COMPLETO DA OPORTUNIDADE:**
${opportunityData ? `
- CONTATOS MAPEADOS:
  • Power Sponsor (Decisor): ${opportunityData.power_sponsor || 'Não identificado'}
  • Sponsor (Patrocinador): ${opportunityData.sponsor || 'Não identificado'}
  • Influenciador: ${opportunityData.influencer || 'Não identificado'}
  • Contato de Suporte: ${opportunityData.support_contact || 'Não identificado'}

- INFORMAÇÕES OPERACIONAIS:
  • Próxima Ação Registrada: ${opportunityData.next_action || 'Nenhuma'}
  • Data de Fechamento Esperada: ${opportunityData.expected_close ? new Date(opportunityData.expected_close).toLocaleDateString('pt-BR') : 'Não definida'}
  • Produto/Solução: ${opportunityData.product || 'Não especificado'}

- DESCRIÇÕES DETALHADAS DAS ESCALAS:
${completeAnalysis?.opportunity?.scaleDescriptions ? `
  • DOR: "${completeAnalysis.opportunity.scaleDescriptions.dor || 'Sem descrição'}"
  • PODER: "${completeAnalysis.opportunity.scaleDescriptions.poder || 'Sem descrição'}"
  • VISÃO: "${completeAnalysis.opportunity.scaleDescriptions.visao || 'Sem descrição'}"
  • VALOR: "${completeAnalysis.opportunity.scaleDescriptions.valor || 'Sem descrição'}"
  • CONTROLE: "${completeAnalysis.opportunity.scaleDescriptions.controle || 'Sem descrição'}"
  • COMPRAS: "${completeAnalysis.opportunity.scaleDescriptions.compras || 'Sem descrição'}"
` : 'Descrições não disponíveis'}
` : 'Contexto não disponível'}

${completeAnalysis?.alerts?.length > 0 ? `
**ALERTAS ATIVOS:**
${completeAnalysis.alerts.slice(0, 3).map(a => `- ${a.message}`).join('\n')}
` : ''}

${webSearchResults ? `
**INFORMAÇÕES ATUALIZADAS DA INTERNET:**
${webSearchResults}
` : ''}

**CASOS DISPONÍVEIS COMO REFERÊNCIA (usar apenas se agregar valor):**
${relevantCasesForReference.length > 0 ? JSON.stringify(relevantCasesForReference, null, 2) : 'Nenhum relevante'}

---
**PERGUNTA DO VENDEDOR:**
"${userInput}"

---
**INSTRUÇÕES FINAIS:**
1. Responda DIRETAMENTE à pergunta em PORTUGUÊS DO BRASIL
2. Use SEMPRE os nomes reais dos contatos quando disponíveis (não diga "o decisor", diga o nome)
3. Estrutura: Diagnóstico → Estratégia → Tática → Evidência (se aplicável)
4. Termine SEMPRE com UMA ação específica para HOJE
5. Se mencionar um caso, que seja breve e no final: "Isso funcionou com [empresa] que conseguiu [resultado]"
6. Máximo 300 palavras total
7. Sem sermões, sem motivação barata, apenas estratégia pura
8. Use terminologia de vendas brasileira: ROI, follow-up, pipeline, deal, sponsor
9. Considere o contexto detalhado da oportunidade (contatos, próxima ação, produto) para personalizar a resposta`;

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
     console.log('❌ Erro na Claude API:', response.status);
     return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
   }

   const data = await response.json();
   const responseText = data.content[0].text;
   
   return { type: 'direct_response', content: responseText };
   
 } catch (error) {
   console.error('❌ Erro chamando Claude:', error);
   return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
 }
}

// ============= FALLBACK INTELIGENTE - ENRIQUECIDO =============
function generateSmartFallback(opportunityData, userInput, analysis) {
 if (!opportunityData) {
   return "❌ Nenhuma oportunidade selecionada. Selecione um cliente do CRM para começar a análise.";
 }

 let response = `📊 **Análise de ${opportunityData.client}**\n\n`;
 
 // Adicionar informações do produto se disponível
 if (opportunityData.product) {
   response += `**Produto:** ${opportunityData.product}\n`;
 }
 
 if (analysis?.opportunity) {
   response += `**Estado:** Saúde ${analysis.opportunity.healthScore}/10 | Probabilidade ${analysis.opportunity.probability}%\n`;
   
   // Adicionar informações dos contatos se disponível
   if (analysis.opportunity.contacts) {
     const contacts = analysis.opportunity.contacts;
     if (contacts.power_sponsor || contacts.sponsor) {
       response += `**Contatos-chave:** ${contacts.power_sponsor || contacts.sponsor}\n`;
     }
   }
   response += '\n';
 }
 
 if (analysis?.alerts?.length > 0) {
   response += `**⚠️ ALERTAS:**\n`;
   analysis.alerts.slice(0, 3).forEach(alert => {
     response += `• ${alert.message}\n`;
   });
   response += '\n';
 }
 
 if (analysis?.nextBestAction) {
   response += `**🎯 PRÓXIMA AÇÃO:**\n`;
   response += `${analysis.nextBestAction.title}\n`;
   response += `${analysis.nextBestAction.action}\n\n`;
   if (analysis.nextBestAction.script) {
     response += `**Script sugerido:**\n`;
     response += `"${analysis.nextBestAction.script}"\n`;
   }
 }
 
 // Se há próxima ação registrada no CRM
 if (opportunityData.next_action) {
   response += `\n**📋 Ação planejada no CRM:** ${opportunityData.next_action}\n`;
 }
 
 // Casos no final se houver
 if (analysis?.relevantCases?.length > 0) {
   response += `\n**📚 Referência:**\n`;
   response += `${analysis.relevantCases[0].empresa} enfrentou algo similar e conseguiu ROI em ${analysis.relevantCases[0].resultados.roi_meses} meses.`;
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
     JSON.stringify({ error: 'Método não permitido' }),
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

   console.log('🧠 Backend recebeu:', { 
     userInput: userInput?.substring(0, 50), 
     hasOpportunity: !!opportunityData,
     vendor: vendorName,
     pipelineSize: pipelineData?.allOpportunities?.length || 0,
     hasContacts: !!(opportunityData?.power_sponsor || opportunityData?.sponsor),
     hasProduct: !!opportunityData?.product
   });

   // PASSO 1: EXECUTAR MOTOR DE ANÁLISE
   console.log('📊 Executando motor de análise completo...');
   const completeAnalysis = buildCompleteAnalysis(opportunityData, pipelineData, vendorName);
   
   // Validação básica
   if (!opportunityData && !isNewOpportunity && !pipelineData?.allOpportunities?.length) {
     return new Response(
       JSON.stringify({ 
         response: "❌ **Não há dados disponíveis**\n\nSelecione um cliente do CRM ou crie uma nova oportunidade.",
         analysis: completeAnalysis
       }),
       { status: 200, headers }
     );
   }

   // Se não há input, dar resumo
   if (!userInput || userInput.trim() === '') {
     let summaryResponse = '';
     
     if (completeAnalysis.pipeline) {
       summaryResponse = `📊 **Resumo do Pipeline**\n\n`;
       summaryResponse += `• Total: ${completeAnalysis.pipeline.total} oportunidades\n`;
       summaryResponse += `• Valor: R$ ${completeAnalysis.pipeline.totalValue.toLocaleString('pt-BR')}\n`;
       summaryResponse += `• Em risco: ${completeAnalysis.pipeline.atRisk} negócios\n`;
       summaryResponse += `• Saúde média: ${completeAnalysis.pipeline.averageHealth}/10\n`;
     }
     
     if (opportunityData && completeAnalysis.nextBestAction) {
       summaryResponse += `\n**Para ${opportunityData.client}:**\n`;
       if (opportunityData.product) {
         summaryResponse += `Produto: ${opportunityData.product}\n`;
       }
       summaryResponse += `${completeAnalysis.nextBestAction.title}\n`;
       summaryResponse += `👉 ${completeAnalysis.nextBestAction.action}`;
     }
     
     return new Response(
       JSON.stringify({ 
         response: summaryResponse || "💬 Em que posso ajudar com as vendas?",
         analysis: completeAnalysis
       }),
       { status: 200, headers }
     );
   }

   // PASSO 2: BUSCA NA WEB SE NECESSÁRIO
   let webSearchResults = null;
   const needsWebSearch = userInput.toLowerCase().includes('atualiz') || 
                         userInput.toLowerCase().includes('notícia') ||
                         userInput.toLowerCase().includes('recente');
   
   if (needsWebSearch && opportunityData?.client) {
     console.log('🔍 Buscando no Google para:', opportunityData.client);
     webSearchResults = await searchGoogleForContext(
       `${opportunityData.client} Brasil ${opportunityData.industry || ''} notícias 2024 2025`
     );
   }

   // PASSO 3: DEFINIR FERRAMENTAS DISPONÍVEIS - ENRIQUECIDAS
   const availableTools = [
     { 
       name: 'analisar', 
       description: 'Análise PPVVCC completa com diagnóstico e próximos passos',
       function: () => {
         let result = `📊 **ANÁLISE DE ${opportunityData?.client || 'PIPELINE'}**\n\n`;
         
         if (opportunityData?.product) {
           result += `**Produto:** ${opportunityData.product}\n\n`;
         }
         
         if (completeAnalysis.opportunity) {
           result += `**Diagnóstico:**\n`;
           result += `Score de Saúde: ${completeAnalysis.opportunity.healthScore}/10\n`;
           result += `Probabilidade: ${completeAnalysis.opportunity.probability}%\n`;
           result += `Dias sem contato: ${completeAnalysis.opportunity.daysSince}\n`;
           
           // Adicionar contatos se disponível
           if (completeAnalysis.opportunity.contacts) {
             const contacts = completeAnalysis.opportunity.contacts;
             if (contacts.power_sponsor || contacts.sponsor || contacts.influencer) {
               result += `\n**Contatos mapeados:**\n`;
               if (contacts.power_sponsor) result += `• Decisor: ${contacts.power_sponsor}\n`;
               if (contacts.sponsor) result += `• Sponsor: ${contacts.sponsor}\n`;
               if (contacts.influencer) result += `• Influenciador: ${contacts.influencer}\n`;
             }
           }
           
           if (completeAnalysis.opportunity.criticalScales.length > 0) {
             result += `\n**Escalas críticas a trabalhar:**\n`;
             completeAnalysis.opportunity.criticalScales.forEach(scale => {
               result += `• ${scale.name}: ${scale.value}/10\n`;
               if (scale.description) {
                 result += `  Observação: "${scale.description}"\n`;
               }
               result += `  → Ação: ${scale.action}\n`;
             });
           }
           
           if (completeAnalysis.nextBestAction) {
             result += `\n**Estratégia recomendada:**\n`;
             result += `${completeAnalysis.nextBestAction.strategy}\n\n`;
             result += `**Próxima ação:**\n`;
             result += completeAnalysis.nextBestAction.action;
           }
         }
         
         return result;
       }
     }
   ];

   // PASSO 4: CHAMADA À CLAUDE
   console.log('🤖 Chamando Claude com estrutura melhorada e contexto completo...');
   
   const claudeResponse = await callClaudeAPI(
     opportunityData,
     userInput,
     { casos: CASOS_EXITO_REAIS },
     availableTools,
     webSearchResults,
     completeAnalysis
   );

   // PASSO 5: RETORNAR RESPOSTA ESTRUTURADA
   return new Response(
     JSON.stringify({ 
       response: claudeResponse.content,
       analysis: completeAnalysis
     }),
     { status: 200, headers }
   );

 } catch (error) {
   console.error('❌ Erro no backend:', error);
   
   return new Response(
     JSON.stringify({ 
       response: '❌ **Erro processando solicitação**\n\nPor favor, tente novamente.',
       error: error.message,
       analysis: null
     }),
     { status: 200, headers }
   );
 }
}

// ============= MOTOR DE ANÁLISE COMPLETO - ENRIQUECIDO =============
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

 // Análise do pipeline
 if (pipelineData?.allOpportunities) {
   analysis.pipeline = analyzePipelineHealth(pipelineData.allOpportunities);
   
   // Insights do pipeline
   if (analysis.pipeline.atRisk > 0) {
     analysis.insights.push({
       type: 'warning',
       message: `📊 ${analysis.pipeline.atRisk} oportunidades em risco por R$ ${analysis.pipeline.riskValue.toLocaleString('pt-BR')}`
     });
   }
   
   if (analysis.pipeline.topDeals.length > 0) {
     analysis.insights.push({
       type: 'opportunity',
       message: `🎯 ${analysis.pipeline.topDeals.length} negócios prontos para fechar este mês`
     });
   }
 }

 // Análise da oportunidade atual - ENRIQUECIDA
 if (opportunityData) {
   analysis.opportunity = analyzeOpportunity(opportunityData);
   analysis.alerts = generateAlerts(opportunityData, pipelineData);
   analysis.nextBestAction = generateNextBestAction(opportunityData, pipelineData);
   analysis.quickActions = generateQuickActions(opportunityData, analysis.alerts);
   analysis.relevantCases = findRelevantCases(opportunityData);
   
   // Insights da oportunidade - ENRIQUECIDOS
   if (analysis.opportunity.probability > 70) {
     const contactInfo = opportunityData.power_sponsor ? ` com ${opportunityData.power_sponsor}` : '';
     analysis.insights.push({
       type: 'success',
       message: `✅ ${opportunityData.client}: Alta probabilidade de fechamento (${analysis.opportunity.probability}%)${contactInfo}`
     });
   } else if (analysis.opportunity.probability < 30) {
     analysis.insights.push({
       type: 'danger',
       message: `⚠️ ${opportunityData.client}: Baixa probabilidade (${analysis.opportunity.probability}%)`
     });
   }

   // NOVO: Insight sobre próxima ação pendente
   if (opportunityData.next_action && getDaysSinceLastContact(opportunityData.last_update) > 2) {
     analysis.insights.push({
       type: 'info',
       message: `📋 Ação pendente: "${opportunityData.next_action}"`
     });
   }

   // NOVO: Insight sobre fechamento próximo
   if (opportunityData.expected_close) {
     const daysToClose = Math.floor((new Date(opportunityData.expected_close) - new Date()) / (1000 * 60 * 60 * 24));
     if (daysToClose <= 30 && daysToClose > 0) {
       analysis.insights.push({
         type: 'info',
         message: `📅 Fechamento esperado em ${daysToClose} dias`
       });
     }
   }

   // Insight baseado em casos similares
   if (analysis.relevantCases.length > 0) {
     const avgRoi = analysis.relevantCases.reduce((sum, c) => sum + (c.resultados.roi_meses || 3), 0) / analysis.relevantCases.length;
     analysis.insights.push({
       type: 'info',
       message: `📚 ${analysis.relevantCases.length} casos similares com ROI médio: ${Math.round(avgRoi)} meses`
     });
   }
 }

 // Análise do vendedor
 if (vendorName && analysis.pipeline?.vendorPerformance?.[vendorName]) {
   const vendorStats = analysis.pipeline.vendorPerformance[vendorName];
   analysis.vendor = {
     name: vendorName,
     stats: vendorStats,
     performance: vendorStats.avgHealth > 6 ? 'excelente' : 
                  vendorStats.avgHealth > 4 ? 'bom' : 'precisa melhorar'
   };
 }

 return analysis;
}

// ============= BUSCA NO GOOGLE (se configurada) =============
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
   console.error('Erro buscando no Google:', error);
   return null;
 }
}
