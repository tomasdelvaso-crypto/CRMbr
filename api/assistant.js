// api/assistant.js - Ventus: coach de vendas PPVVCC
// Motor de análise determinístico + Claude por cima.

// Runtime Node.js (NÃO edge). O runtime edge derruba a função com 504 se ela
// não devolver a resposta inicial em 25s — limite fixo da plataforma que ignora
// maxDuration — e a "análise completa" (effort medium, até 5000 tokens) passa
// disso com frequência. No Node, maxDuration (60s, também em vercel.json) manda.
export const config = {
 runtime: 'nodejs',
 maxDuration: 60,
};

import PromptBuilder, { buildStaticSystem } from './_lib/promptBuilder.js';
import {
  SCALE_KEYS,
  getScale,
  getScaleValue,
  getScaleDescription,
  getScaleScores,
  calculateHealthScore,
  getDaysSinceLastContact,
} from './_lib/ppvvcc.js';
import { verifyRequest, unauthorizedResponse } from './_lib/auth.js';

const CLAUDE_MODEL = 'claude-sonnet-5';
// Orçamento de tempo por request, abaixo do maxDuration (60s). Toda chamada de
// rede recebe um AbortSignal derivado dele: se a Claude API (ou a auth, ou a
// busca web) demorar demais, caímos no fallback determinístico já existente em
// vez de um 504 sem corpo. O prazo conta desde o início do request, não do fetch.
const REQUEST_BUDGET_MS = 55_000;
const AUX_FETCH_TIMEOUT_MS = 8_000; // auth Supabase e busca Serper
function remainingSignal(deadline, floorMs = 5_000) {
  return AbortSignal.timeout(Math.max(floorMs, deadline - Date.now()));
}
// Preço de lista claude-sonnet-5 (USD por 1M tokens) — só para log de custo
const PRICE_IN = 3;
const PRICE_OUT = 15;

// ============= CASOS DE ÊXITO REAIS VENTAPEL =============
const CASOS_EXITO_REAIS = {
 'honda': {
   empresa: 'Honda Argentina',
   setor: 'Automotivo',
   produto_linha: ['better_pack', 'better_pack_venom'],
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
   produto_linha: ['better_pack_venom'],
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
   produto_linha: ['better_pack_venom'],
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
   produto_linha: ['better_pack_venom'],
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
  produto_linha: ['better_pack_venom'],
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
},

'ecomfill_ecommerce': {
  empresa: 'Referência: E-commerce Moda BR',
  setor: 'E-commerce/Moda',
  produto_linha: ['ecomfill_resmas'],
  problema: 'Over-packaging com caixas de cartão para produtos não frágeis (roupas, acessórios), alto custo de frete por peso volumétrico, devoluções complicadas',
  solucao: 'E-combag Paper com sistema Vai e Vem + E-combag Pro para itens frágeis',
  resultados: {
    reducao_material: '-60% custo de material vs caixa+preenchimento',
    frete: '-35% custo de frete por peso volumétrico reduzido',
    velocidade_packing: '+50% velocidade de empacotamento',
    devolucoes: 'Sistema Vai e Vem facilita logística inversa',
    roi_meses: 3,
    investimento: 80000
  },
  tags: ['e-commerce', 'moda', 'têxtil', 'logística-inversa', 'sustentável', 'sobres', 'SIOC', 'frete'],
  metricas_detalhe: {
    regiao: 'Brasil',
    tipo_operacao: 'Fulfillment center moda/acessórios',
    volume: 'Médio-alto volume diário',
    beneficio_principal: 'Eliminação de caixas para 70% dos envios'
  },
  aprendizado_chave: 'Para moda e acessórios, a caixa de cartão é over-packaging. O E-combag Paper elimina caixa, relleno e cinta de um golpe. O sistema Vai e Vem resolve a logística inversa que é pesadelo do e-commerce de moda.'
},

'ecomfill_cosmeticos': {
  empresa: 'Referência: Indústria Cosmética BR',
  setor: 'Cosmética/DTC',
  produto_linha: ['ecomfill_resmas'],
  problema: 'Plástico bolha para proteger frascos gera imagem negativa da marca, unboxing experience pobre, custo alto de preenchimento',
  solucao: 'E-compaper Wrap (honeycomb) + E-comfill V-PAD TH para void-fill',
  resultados: {
    eliminacao_plastico: '100% eliminação de plástico bolha',
    unboxing: 'Melhoria significativa na experiência de unboxing',
    sustentabilidade: '100% papel reciclável',
    velocidade: '+40% velocidade de preenchimento',
    roi_meses: 4,
    investimento: 120000
  },
  tags: ['cosmética', 'DTC', 'sustentável', 'unboxing', 'papel', 'premium', 'anti-plástico'],
  metricas_detalhe: {
    regiao: 'Brasil',
    tipo_operacao: 'Envio direto ao consumidor (DTC)',
    beneficio_principal: 'Papel honeycomb dá visual premium e é 100% reciclável'
  },
  aprendizado_chave: 'Marcas premium de cosmética estão sob pressão para eliminar plástico. O E-compaper Wrap (honeycomb) dá proteção real + visual premium no unboxing. É o oposto do plástico bolha — o cliente percebe como sustentável e sofisticado.'
},

'ecomfill_fulfillment': {
  empresa: 'Referência: Centro de Fulfillment BR',
  setor: 'Logística/3PL',
  produto_linha: ['ecomfill_resmas', 'better_pack_venom'],
  problema: 'Air pillows ocupam muito espaço de armazém, velocidade de preenchimento lenta, ESG exigindo redução de plástico',
  solucao: 'E-comfill V-FILLT PRO (126.5 m/min) + E-compaper Fill + BP555e para fechamento',
  resultados: {
    espaco_armazem: '-80% espaço de armazenamento vs air pillows',
    velocidade: '126.5 m/min de preenchimento (anti-atolamento)',
    eliminacao_plastico: '100% eliminação de air pillows',
    roi_meses: 6,
    investimento: 250000
  },
  tags: ['logística', '3PL', 'fulfillment', 'air-pillows', 'sustentável', 'alto-volume', 'armazém', 'ESG'],
  metricas_detalhe: {
    regiao: 'Brasil',
    tipo_operacao: 'Centro de fulfillment multi-cliente',
    volume: 'Alto volume (1000+ pacotes/dia)',
    beneficio_principal: 'Rolos de papel flat ocupam fração do espaço de air pillows pre-inflados'
  },
  aprendizado_chave: 'O V-FILLT PRO é a arma para alto volume. 126.5 m/min com anti-atolamento resolve o gargalo de preenchimento. O argumento killer é espaço: rolos de papel flat vs montanhas de air pillows. E compliance ESG cada vez mais exigido por clientes grandes.'
}
};

// ============= BUSCAR CASOS RELEVANTES =============
function findRelevantCases(opportunity) {
 if (!opportunity) return [];

 const relevantCases = [];
 const oppTags = [];
 const oppProductLines = opportunity.product_lines || [];

 if (opportunity.industry) {
   oppTags.push(opportunity.industry.toLowerCase());
 }
 if (opportunity.product) {
   if (opportunity.product.toLowerCase().includes('bp')) oppTags.push('máquina');
   if (opportunity.product.toLowerCase().includes('fita')) oppTags.push('fita');
   if (opportunity.product.toLowerCase().includes('venom')) oppTags.push('anti-roubo');
   if (opportunity.product.toLowerCase().includes('ecomfill')) oppTags.push('sustentável');
   if (opportunity.product.toLowerCase().includes('sobre')) oppTags.push('sobres');
   if (opportunity.product.toLowerCase().includes('resma')) oppTags.push('papel');
 }
 if (opportunity.value > 500000) {
   oppTags.push('enterprise', 'alto-volume');
 }
 const dorDesc = getScaleDescription(getScale(opportunity.scales, 'dor')).toLowerCase();
 if (dorDesc.includes('roubo')) oppTags.push('anti-roubo');
 if (dorDesc.includes('ergon')) oppTags.push('ergonomia');
 if (dorDesc.includes('plástico') || dorDesc.includes('sustentab')) {
   oppTags.push('sustentável', 'anti-plástico');
 }

 Object.entries(CASOS_EXITO_REAIS).forEach(([key, caso]) => {
   let score = 0;

   // PRIORIDADE 1: Coincidência por linha de produto (peso alto)
   if (caso.produto_linha && oppProductLines.length > 0) {
     const lineMatch = caso.produto_linha.some(pl => oppProductLines.includes(pl));
     if (lineMatch) {
       score += 5;
     } else {
       score -= 3;
     }
   }

   if (opportunity.industry && caso.setor.toLowerCase().includes(opportunity.industry.toLowerCase())) {
     score += 3;
   }

   if (caso.tags) {
     caso.tags.forEach(tag => {
       if (oppTags.includes(tag)) {
         score += 1;
       }
     });
   }

   if (dorDesc && caso.problema) {
     const problemWords = dorDesc.split(' ');
     const casoWords = caso.problema.toLowerCase().split(' ');
     const matches = problemWords.filter(word => word.length > 3 && casoWords.includes(word));
     score += matches.length * 0.5;
   }

   if (score > 0) {
     relevantCases.push({ ...caso, score, key });
   }
 });

 return relevantCases
   .sort((a, b) => b.score - a.score)
   .slice(0, 2);
}

// ============= DEALS FECHADOS RELEVANTES (lições reais do CRM) =============
function findRelevantClosedDeals(opportunity, allOpportunities) {
  if (!opportunity || !Array.isArray(allOpportunities)) return [];

  const client = (opportunity.client || '').toLowerCase();
  const industry = (opportunity.industry || '').toLowerCase();

  return allOpportunities
    .filter(o => o.outcome && o.id !== opportunity.id)
    .filter(o => {
      const sameClient = client && (o.client || '').toLowerCase() === client;
      const sameIndustry = industry && (o.industry || '').toLowerCase() === industry;
      return sameClient || sameIndustry;
    })
    // Deals com lições registradas primeiro
    .sort((a, b) => (b.outcome_notes ? 1 : 0) - (a.outcome_notes ? 1 : 0))
    .slice(0, 5)
    .map(o => ({
      client: o.client,
      industry: o.industry,
      value: o.value,
      product: o.product,
      outcome: o.outcome,
      outcome_notes: o.outcome_notes,
    }));
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
   const health = calculateHealthScore(opp.scales);
   const daysSince = getDaysSinceLastContact(opp.last_update);
   return health < 4 || daysSince > 7;
 });

 const topDeals = opportunities
   .filter(opp => {
     const health = calculateHealthScore(opp.scales);
     return health > 6 && opp.stage >= 3;
   })
   .sort((a, b) => b.value - a.value)
   .slice(0, 5)
   .map(deal => ({
     client: deal.client,
     value: deal.value,
     health: calculateHealthScore(deal.scales).toFixed(1),
     vendor: deal.vendor,
     action: deal.stage === 5 ? 'FECHAR JÁ' : 'Acelerar fechamento'
   }));

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
   vendorPerformance[opp.vendor].avgHealth += calculateHealthScore(opp.scales);
   if (opp.stage === 6) vendorPerformance[opp.vendor].closed++;
 });

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
     sum + calculateHealthScore(opp.scales), 0) / opportunities.length).toFixed(1),
   topDeals,
   vendorPerformance
 };
}

// ============= ANÁLISE DE OPORTUNIDADE INDIVIDUAL =============
function analyzeOpportunity(opportunity, activityHistory) {
 if (!opportunity) return null;

 const healthScore = calculateHealthScore(opportunity.scales);
 const daysSince = getDaysSinceLastContact(opportunity.last_update, activityHistory);

 // Probabilidade baseada em escalas
 let probability = 0;
 if (healthScore >= 8) probability = 85;
 else if (healthScore >= 7) probability = 70;
 else if (healthScore >= 5) probability = 40;
 else if (healthScore >= 3) probability = 20;
 else probability = 5;

 if (daysSince > 30) probability = Math.max(probability - 50, 5);
 else if (daysSince > 14) probability = Math.max(probability - 20, 10);
 else if (daysSince > 7) probability = Math.max(probability - 10, 15);

 const scales = opportunity.scales || {};
 const scaleBreakdown = getScaleScores(scales);

 const scaleDescriptions = {};
 SCALE_KEYS.forEach(key => {
   scaleDescriptions[key] = getScaleDescription(getScale(scales, key));
 });

 const criticalScales = [];
 if (scaleBreakdown.dor < 5) {
   criticalScales.push({
     name: 'DOR',
     value: scaleBreakdown.dor,
     issue: 'Cliente não admite o problema',
     action: 'Aplicar técnica SPIN para elevar dor',
     description: scaleDescriptions.dor
   });
 }
 if (scaleBreakdown.poder < 4) {
   criticalScales.push({
     name: 'PODER',
     value: scaleBreakdown.poder,
     issue: 'Sem acesso ao decisor',
     action: opportunity.power_sponsor
       ? `Conseguir reunião com ${opportunity.power_sponsor}`
       : 'Identificar e acessar o Power Sponsor',
     description: scaleDescriptions.poder
   });
 }
 if (scaleBreakdown.visao < 4) {
   criticalScales.push({
     name: 'VISÃO',
     value: scaleBreakdown.visao,
     issue: 'Cliente não vê a solução',
     action: 'Demo com caso de êxito relevante',
     description: scaleDescriptions.visao
   });
 }
 if (scaleBreakdown.valor < 4) {
   criticalScales.push({
     name: 'VALOR',
     value: scaleBreakdown.valor,
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
   scaleBreakdown,
   scaleDescriptions,
   contacts: {
     power_sponsor: opportunity.power_sponsor,
     sponsor: opportunity.sponsor,
     influencer: opportunity.influencer,
     support_contact: opportunity.support_contact
   },
   product: opportunity.product,
   next_action: opportunity.next_action,
   expected_close: opportunity.expected_close
 };
}

// ============= GERAÇÃO DE ALERTAS =============
function generateAlerts(opportunity, activityHistory) {
 const alerts = [];
 if (!opportunity) return alerts;

 const daysSince = getDaysSinceLastContact(opportunity.last_update, activityHistory);
 const healthScore = calculateHealthScore(opportunity.scales);
 const scales = opportunity.scales || {};

 if (daysSince > 30) {
   const contactName = opportunity.sponsor || opportunity.power_sponsor || 'o contato';
   alerts.push({
     type: 'critical',
     priority: 1,
     message: `💀 NEGÓCIO MORTO: ${daysSince} dias sem falar com ${contactName}`,
     action: `Ligar HOJE para ${contactName} para reativar ou descartar`
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

 if (opportunity.expected_close) {
   const daysToClose = Math.floor((new Date(opportunity.expected_close) - new Date()) / (1000 * 60 * 60 * 24));
   const poderScore = getScaleValue(getScale(scales, 'poder'));

   if (daysToClose <= 30 && poderScore < 5 && !opportunity.power_sponsor) {
     alerts.push({
       type: 'urgent',
       priority: 1,
       message: `⚡ Fechamento previsto em ${daysToClose} dias SEM ACESSO AO DECISOR`,
       action: 'URGENTE: Mapear e acessar Power Sponsor esta semana'
     });
   }
 }

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

 const dorScore = getScaleValue(getScale(scales, 'dor'));
 const poderScore = getScaleValue(getScale(scales, 'poder'));

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

 if (healthScore >= 8 && opportunity.stage < 5) {
   alerts.push({
     type: 'opportunity',
     priority: 3,
     message: `🔥 OPORTUNIDADE: Negócio quente (${healthScore}/10) - Acelerar fechamento`,
     action: 'Propor contrato esta semana'
   });
 }

 if (opportunity.next_action && daysSince > 2) {
   alerts.push({
     type: 'warning',
     priority: 3,
     message: `📅 Ação pendente: "${opportunity.next_action}"`,
     action: 'Executar ação registrada ou atualizar plano'
   });
 }

 return alerts.sort((a, b) => a.priority - b.priority);
}

// ============= NEXT BEST ACTION =============
// Regra: sem números inventados. Os scripts orientam O QUE perguntar/propor;
// os números concretos saem do vendedor ou de casos de referência citados.
function generateNextBestAction(opportunity, activityHistory) {
 if (!opportunity?.scales) return null;

 const daysSince = getDaysSinceLastContact(opportunity.last_update, activityHistory);
 const scales = opportunity.scales || {};

 const dorScore = getScaleValue(getScale(scales, 'dor'));
 const poderScore = getScaleValue(getScale(scales, 'poder'));
 const visaoScore = getScaleValue(getScale(scales, 'visao'));
 const valorScore = getScaleValue(getScale(scales, 'valor'));
 const controleScore = getScaleValue(getScale(scales, 'controle'));

 const contactName = opportunity.sponsor || 'o contato';
 const decisionMaker = opportunity.power_sponsor || 'o decisor';

 // Prioridade 1: Negócios mortos
 if (daysSince > 30) {
   return {
     priority: 'CRÍTICA',
     title: '💀 NEGÓCIO MORTO - Última oportunidade',
     action: `Ligação de resgate HOJE para ${contactName}`,
     strategy: 'Reabrir a conversa com um motivo concreto (novidade, caso de êxito, mudança no contexto do cliente)',
     script: `"${contactName}, faz ${daysSince} dias que não conversamos. Surgiu algo que pode mudar a conta que fizemos na época — vale 15 minutos essa semana pra eu te mostrar?"`,
     expectedOutcome: 'Reativar ou descartar definitivamente'
   };
 }

 // Se há próxima ação registrada e não foi executada
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
     strategy: 'Retomar com valor novo (caso de êxito da indústria, insight da operação deles), não com cobrança',
     script: `Email curto para ${contactName}: referencie o último ponto aberto da conversa e traga UM motivo novo para retomar (caso de êxito do setor, mudança sazonal, novidade de produto). Feche pedindo 15 minutos.`,
     expectedOutcome: 'Reunião agendada em 48h'
   };
 }

 // Prioridade 3: Sem dor admitida
 if (dorScore < 5) {
   const dorDescription = getScaleDescription(getScale(scales, 'dor'));
   return {
     priority: 'ALTA',
     title: '🎯 Sem DOR = Sem venda',
     action: `Sessão SPIN profunda com ${contactName}`,
     strategy: dorDescription ? `Explorar: "${dorDescription}"` : 'Quantificar perdas ocultas com perguntas de implicação',
     script: `Perguntas para ${contactName}: quantas caixas processam por mês? Quantas se abrem ou são violadas em trânsito? Quanto custa cada retrabalho/devolução (tempo + material + frete)? Documentar as respostas e devolver por escrito para o cliente confirmar — isso sobe a DOR de nível.`,
     expectedOutcome: 'Dor admitida e quantificada com números DO CLIENTE'
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
     strategy: `Fazer ${sponsor} ser o herói da história internamente`,
     script: `"${sponsor}, com os números que levantamos juntos, o próximo passo natural é apresentar isso para ${decisionMaker}. Preparo o material e apresentamos juntos — você leva o crédito da iniciativa. Consegue abrir essa agenda?"`,
     expectedOutcome: 'Reunião com decisor em 7 dias'
   };
 }

 // Prioridade 5: Sem visão clara
 if (visaoScore < 5) {
   const productFocus = opportunity.product || 'nossa solução';
   return {
     priority: 'MÉDIA',
     title: '👁️ Construir VISÃO da solução',
     action: `Demo personalizada de ${productFocus}`,
     strategy: 'Mostrar o futuro sem os problemas atuais, no contexto da operação DELES',
     script: `"Imagina sua operação sem caixas abertas, sem reclamações, com fechamento mais rápido. Vou te mostrar exatamente como ${productFocus} funciona com o SEU tipo de caixa e o SEU volume — me passa os dados e monto a demo em cima disso."`,
     expectedOutcome: 'Visão clara e diferenciada'
   };
 }

 // Prioridade 6: Sem valor percebido
 if (valorScore < 5) {
   return {
     priority: 'MÉDIA',
     title: '💰 Demonstrar ROI concreto',
     action: `Construir business case COM o cliente e apresentar para ${decisionMaker}`,
     strategy: 'ROI com números do próprio cliente — nunca números nossos',
     script: `"Para o business case ficar sólido pro ${decisionMaker}, preciso de 3 números seus: volume mensal de caixas, custo atual por caixa fechada (material + mão de obra) e % de perdas/retrabalho. Com isso monto a conta de economia anual e revisamos juntos antes de apresentar."`,
     expectedOutcome: 'ROI validado e aceito pelo cliente'
   };
 }

 // Prioridade 7: Pronto para fechar
 if (dorScore >= 7 && poderScore >= 6 && valorScore >= 6 && controleScore >= 6) {
   const closer = opportunity.power_sponsor || opportunity.sponsor || 'o responsável';
   return {
     priority: 'OPORTUNIDADE',
     title: '🏆 FECHAR ESTA SEMANA',
     action: 'Pressionar para assinatura',
     strategy: 'Criar urgência positiva com um próximo passo concreto',
     script: `"${closer}, já validamos problema, solução e ROI. Posso reservar a agenda de implementação para a próxima semana — fechamos hoje para garantir esse prazo?"`,
     expectedOutcome: 'Contrato assinado em 72h'
   };
 }

 // Default: Manter momentum
 return {
   priority: 'NORMAL',
   title: '📈 Manter momentum',
   action: 'Avançar metodologia',
   strategy: 'Próximo passo segundo PPVVCC',
   script: 'Revisar escalas e avançar a mais baixa para o próximo nível da definição',
   expectedOutcome: 'Progresso nas escalas'
 };
}

// ============= CHAMADA À CLAUDE API =============
async function callClaudeAPI({ opportunityData, userInput, webSearchResults, completeAnalysis, activityHistory, closedDeals, chatHistory, depth, deadline }) {
 const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

 if (!ANTHROPIC_API_KEY) {
   console.log('⚠️ Claude API não configurada, usando fallback');
   return { type: 'fallback', content: generateSmartFallback(opportunityData, completeAnalysis) };
 }

 const promptBuilder = new PromptBuilder()
   .addOpportunityContext(opportunityData)
   .addScalesAnalysis(completeAnalysis)
   .addContacts(opportunityData)
   .addOperationalInfo(opportunityData)
   .addScaleDescriptions(completeAnalysis)
   .addAlerts(completeAnalysis)
   .addRelevantCases(completeAnalysis?.relevantCases)
   .addClosedDealsContext(closedDeals)
   .addActivityHistory(activityHistory)
   .addWebSearchResults(webSearchResults)
   .addUserQuestion(userInput)
   .addFinalInstructions(depth);

 const contextPrompt = promptBuilder.build();
 console.log(`📊 Prompt dinâmico: ${promptBuilder.getSectionCount()} seções, ~${promptBuilder.estimateTokens()} tokens estimados, depth=${depth}`);

 // Histórico do chat (memória de conversa): [{role, content}]
 const history = sanitizeChatHistory(chatHistory);
 const messages = [...history, { role: 'user', content: contextPrompt }];

 try {
   const response = await fetch("https://api.anthropic.com/v1/messages", {
     method: "POST",
     signal: remainingSignal(deadline),
     headers: {
       "Content-Type": "application/json",
       "x-api-key": ANTHROPIC_API_KEY,
       "anthropic-version": "2023-06-01"
     },
     body: JSON.stringify({
       model: CLAUDE_MODEL,
       max_tokens: depth === 'deep' ? 5000 : 3000,
       // effort controla a profundidade do raciocínio: 'low' responde em segundos
       // (o motor determinístico já entrega a análise mastigada); 'medium' para
       // análises profundas equivale ao nível alto da geração anterior.
       // Sem isso, o default 'high' estoura o limite de tempo da função (504).
       output_config: { effort: depth === 'deep' ? 'medium' : 'low' },
       // System estático em bloco cacheável: metodologia + definições de escala
       // não mudam entre requests → prompt caching reduz custo e latência.
       system: [
         {
           type: 'text',
           text: buildStaticSystem(),
           cache_control: { type: 'ephemeral' }
         }
       ],
       messages
     })
   });

   if (!response.ok) {
     const errorBody = await response.text().catch(() => 'No error body');
     console.log(`❌ Erro na Claude API: ${response.status} - ${errorBody}`);
     return { type: 'fallback', content: generateSmartFallback(opportunityData, completeAnalysis) };
   }

   const data = await response.json();
   const responseText = (data.content || [])
     .filter(b => b.type === 'text')
     .map(b => b.text)
     .join('');

   logUsage('chat', data.usage);

   if (!responseText) {
     console.log(`⚠️ Resposta sem texto (stop_reason: ${data.stop_reason})`);
     return { type: 'fallback', content: generateSmartFallback(opportunityData, completeAnalysis) };
   }

   return { type: 'direct_response', content: responseText };

 } catch (error) {
   console.error(`❌ Erro chamando Claude (${error.name}):`, error.message);
   return { type: 'fallback', content: generateSmartFallback(opportunityData, completeAnalysis) };
 }
}

function sanitizeChatHistory(chatHistory) {
  if (!Array.isArray(chatHistory)) return [];
  const clean = chatHistory
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }))
    .slice(-12);
  // A conversa enviada à API deve começar com 'user'
  while (clean.length > 0 && clean[0].role !== 'user') clean.shift();
  return clean;
}

function logUsage(label, usage) {
  if (!usage) return;
  const inputCost = ((usage.input_tokens || 0) / 1_000_000) * PRICE_IN;
  const outputCost = ((usage.output_tokens || 0) / 1_000_000) * PRICE_OUT;
  const cacheRead = usage.cache_read_input_tokens || 0;
  console.log(`💰 [${label}] ~$${(inputCost + outputCost).toFixed(4)} (${usage.input_tokens}in + ${usage.output_tokens}out, cache_read=${cacheRead})`);
}

// ============= FALLBACK (sem Claude) =============
function generateSmartFallback(opportunityData, analysis) {
 if (!opportunityData) {
   return "⚠️ (resposta automática — IA indisponível) Selecione um cliente do CRM para eu poder te ajudar.";
 }

 let parts = [];

 parts.push(`⚠️ (resposta automática — IA indisponível no momento)\n\n${opportunityData.client}`);

 if (analysis?.opportunity) {
   parts.push(`tá com saúde ${analysis.opportunity.healthScore}/10 e probabilidade de ${analysis.opportunity.probability}%.`);
   if (analysis.opportunity.daysSince > 7) {
     parts.push(`Faz ${analysis.opportunity.daysSince} dias sem contato.`);
   }
 }

 if (analysis?.alerts?.length > 0) {
   parts.push(analysis.alerts[0].message);
 }

 if (analysis?.nextBestAction) {
   parts.push(`${analysis.nextBestAction.action}`);
   if (analysis.nextBestAction.script) {
     parts.push(`\nScript: "${analysis.nextBestAction.script}"`);
   }
 }

 if (opportunityData.next_action) {
   parts.push(`Ação pendente no CRM: ${opportunityData.next_action}`);
 }

 if (analysis?.relevantCases?.length > 0) {
   parts.push(`${analysis.relevantCases[0].empresa} passou por algo parecido e teve ROI em ${analysis.relevantCases[0].resultados.roi_meses} meses.`);
 }

 return parts.join(' ');
}

// ============= ACTION PLAN =============
function determineActionCount(opportunity, analysis) {
  if (!opportunity || !analysis?.opportunity) return 1;

  const health = analysis.opportunity.healthScore;
  const daysSince = analysis.opportunity.daysSince;
  const stage = opportunity.stage || 1;

  const scales = analysis.opportunity.scaleBreakdown || {};
  const lowScales = Object.values(scales).filter(s => s < 3).length;

  // 2 ações só se: deal frío com múltiplas escalas baixas E sem contato recente
  if (lowScales >= 3 && daysSince >= 14) return 2;

  // 2 ações se estamos em etapas iniciais com muito por descobrir
  if (stage <= 2 && health < 4) return 2;

  return 1;
}

// Tool schema: força saída estruturada validada pela API (sem parseo de JSON à mão)
const ACTION_PLAN_TOOL = {
  name: 'submit_action_plan',
  description: 'Registra o plano de ações gerado para a oportunidade.',
  input_schema: {
    type: 'object',
    properties: {
      diagnosis: {
        type: 'string',
        description: '1 frase com o diagnóstico principal desta oportunidade'
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título curto da ação (max 60 chars)' },
            description: { type: 'string', description: 'O que fazer especificamente, com nomes reais dos contatos' },
            target_scale: { type: 'string', enum: ['dor', 'poder', 'visao', 'valor', 'controle', 'compras'] },
            current_score: { type: 'integer' },
            target_score: { type: 'integer' },
            action_type: { type: 'string', enum: ['call', 'email', 'meeting', 'demo', 'proposal', 'whatsapp', 'linkedin'] },
            priority: { type: 'string', enum: ['critica', 'alta', 'media'] },
            draft_content: { type: 'string', description: 'Rascunho completo e usável: email inteiro, roteiro de ligação com perguntas SPIN, ou pauta de reunião. Personalizado.' },
            tool_reference: { type: ['string', 'null'], description: 'Nome do caso de êxito ou ferramenta a usar, ou null' },
            expected_outcome: { type: 'string', description: 'Resultado esperado em 1 frase' }
          },
          required: ['title', 'description', 'target_scale', 'current_score', 'target_score', 'action_type', 'priority', 'draft_content', 'expected_outcome']
        }
      }
    },
    required: ['diagnosis', 'actions']
  }
};

async function generateActionPlan(opportunityData, completeAnalysis, vendorName, activityHistory, closedDeals, deadline) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  const numActions = determineActionCount(opportunityData, completeAnalysis);

  const promptBuilder = new PromptBuilder()
    .addOpportunityContext(opportunityData)
    .addScalesAnalysis(completeAnalysis)
    .addContacts(opportunityData)
    .addOperationalInfo(opportunityData)
    .addScaleDescriptions(completeAnalysis)
    .addAlerts(completeAnalysis)
    .addRelevantCases(completeAnalysis?.relevantCases)
    .addClosedDealsContext(closedDeals)
    .addActivityHistory(activityHistory)
    .addActionPlanRequest(numActions);

  const prompt = promptBuilder.build();

  console.log(`🎯 Gerando Action Plan: ${numActions} ações para ${opportunityData?.client}`);

  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️ Claude API não configurada, gerando fallback');
    return generateFallbackActionPlan(opportunityData, completeAnalysis, numActions);
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: remainingSignal(deadline),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        // Saída estruturada garantida: tool_choice forçado + thinking off
        // (geração de JSON não precisa de raciocínio visível e fica mais rápida)
        thinking: { type: 'disabled' },
        system: [
          {
            type: 'text',
            text: buildStaticSystem(),
            cache_control: { type: 'ephemeral' }
          }
        ],
        tools: [ACTION_PLAN_TOOL],
        tool_choice: { type: 'tool', name: 'submit_action_plan' },
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'No error body');
      console.log(`❌ Erro Action Plan Claude: ${response.status} - ${errorBody}`);
      return generateFallbackActionPlan(opportunityData, completeAnalysis, numActions);
    }

    const data = await response.json();
    logUsage('action_plan', data.usage);

    const toolBlock = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_action_plan');
    if (toolBlock?.input?.actions && Array.isArray(toolBlock.input.actions)) {
      return {
        success: true,
        actions: toolBlock.input.actions.slice(0, numActions),
        diagnosis: toolBlock.input.diagnosis || null,
        numRequested: numActions,
        source: 'claude'
      };
    }

    console.log('⚠️ Action Plan sem tool_use válido, usando fallback');
    return generateFallbackActionPlan(opportunityData, completeAnalysis, numActions);

  } catch (error) {
    console.error('❌ Erro gerando Action Plan:', error.message);
    return generateFallbackActionPlan(opportunityData, completeAnalysis, numActions);
  }
}

function generateFallbackActionPlan(opportunity, analysis, numActions) {
  if (!opportunity || !analysis?.opportunity) {
    return { success: false, actions: [], diagnosis: 'Sem dados suficientes', source: 'fallback' };
  }

  const actions = [];
  const opp = analysis.opportunity;
  const contactName = opportunity.sponsor || opportunity.power_sponsor || 'o contato';

  const scaleEntries = SCALE_KEYS
    .map(key => ({ key, score: opp.scaleBreakdown[key], label: key.toUpperCase() }))
    .sort((a, b) => a.score - b.score);

  for (let i = 0; i < Math.min(numActions, scaleEntries.length); i++) {
    const scale = scaleEntries[i];
    if (scale.score >= 8) continue;

    actions.push({
      title: `Elevar ${scale.label} de ${scale.score} para ${Math.min(scale.score + 2, 10)}`,
      description: `Trabalhar a escala ${scale.label} que está em ${scale.score}/10`,
      target_scale: scale.key,
      current_score: scale.score,
      target_score: Math.min(scale.score + 2, 10),
      action_type: 'call',
      priority: scale.score < 3 ? 'critica' : scale.score < 5 ? 'alta' : 'media',
      draft_content: `Ligar para ${contactName} de ${opportunity.client} e trabalhar ${scale.label}.`,
      tool_reference: null,
      expected_outcome: `${scale.label} subir para ${Math.min(scale.score + 2, 10)}/10`
    });
  }

  return {
    success: true,
    actions,
    diagnosis: `⚠️ Plano automático (IA indisponível). Escalas mais fracas: ${scaleEntries.slice(0, 2).map(s => `${s.label}=${s.score}`).join(', ')}`,
    numRequested: numActions,
    source: 'fallback'
  };
}

// ============= HANDLER PRINCIPAL =============
async function handler(req) {
 const headers = {
   'Access-Control-Allow-Credentials': 'true',
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
   'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
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

 // Auth (fail-open até configurar SUPABASE_URL/SUPABASE_ANON_KEY no Vercel)
 // Prazo do request: tudo que sai pela rede recebe um AbortSignal derivado dele
 const deadline = Date.now() + REQUEST_BUDGET_MS;
 const auth = await verifyRequest(req, { signal: AbortSignal.timeout(AUX_FETCH_TIMEOUT_MS) });
 if (!auth.ok) {
   return unauthorizedResponse(headers);
 }

 try {
   const body = await req.json();
   const {
     userInput,
     opportunityData,
     vendorName,
     pipelineData,
     isNewOpportunity,
     requestType,
     activityHistory,
     chatHistory,
     closedDeals,
     isAdmin
   } = body;

   console.log('🧠 Backend recebeu:', {
     userInput: userInput?.substring(0, 50),
     hasOpportunity: !!opportunityData,
     vendor: vendorName,
     pipelineSize: pipelineData?.allOpportunities?.length || 0,
     historyLen: chatHistory?.length || 0,
     requestType: requestType || 'chat',
     authEnforced: auth.enforced
   });

   // PASSO 1: MOTOR DE ANÁLISE
   const completeAnalysis = buildCompleteAnalysis(opportunityData, pipelineData, vendorName, activityHistory);

   // Deals fechados relevantes: enviados pelo cliente ou derivados do pipeline
   const relevantClosedDeals = Array.isArray(closedDeals) && closedDeals.length > 0
     ? closedDeals
     : findRelevantClosedDeals(opportunityData, pipelineData?.allOpportunities);

   // ===== ROTA: ACTION PLAN =====
   if (requestType === 'action_plan') {
     const actionPlan = await generateActionPlan(opportunityData, completeAnalysis, vendorName, activityHistory, relevantClosedDeals, deadline);
     return new Response(
       JSON.stringify({
         response: null,
         analysis: completeAnalysis,
         actionPlan: actionPlan
       }),
       { status: 200, headers }
     );
   }

   // ===== ROTA: CADÊNCIA (leve, direto ao Claude) =====
   if (requestType === 'cadencia' && userInput) {
     const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
     if (!ANTHROPIC_API_KEY) {
       return new Response(JSON.stringify({ response: '⚠️ API key não configurada.' }), { status: 200, headers });
     }
     try {
       const resp = await fetch('https://api.anthropic.com/v1/messages', {
         method: 'POST',
         signal: remainingSignal(deadline),
         headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
         body: JSON.stringify({
           model: 'claude-haiku-4-5-20251001',
           max_tokens: 800,
           temperature: 0.4,
           system: `Você é o "Ventus", coach de vendas da Ventapel Brasil. Linhas: Máquinas Better Pack, Better Pack + Venom (anti-violação), E-comfill + Resmas, E-Combag (sobres papel), Serviço de Manutenção. Fale direto, prático, como colega. NUNCA invente dados.`,
           messages: [{ role: 'user', content: userInput }],
         }),
       });
       const data = await resp.json();
       if (data.error) {
         console.error('📞 Cadencia Claude API error:', JSON.stringify(data.error));
         return new Response(JSON.stringify({ response: '❌ API: ' + (data.error.message || JSON.stringify(data.error)) }), { status: 200, headers });
       }
       return new Response(JSON.stringify({ response: data.content?.[0]?.text || 'Sem resposta.' }), { status: 200, headers });
     } catch (e) {
       console.error('Cadencia Claude error:', e);
       return new Response(JSON.stringify({ response: '❌ Erro: ' + (e.message || e) }), { status: 200, headers });
     }
   }

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

   // Sem input → resumo rápido (sem gastar Claude)
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

   // PASSO 2: BUSCA NA WEB SE NECESSÁRIO (anos dinâmicos)
   let webSearchResults = null;
   const lowered = userInput.toLowerCase();
   const needsWebSearch = ['atualiz', 'notícia', 'noticia', 'recente', 'novidade', 'mercado'].some(k => lowered.includes(k));

   if (needsWebSearch && opportunityData?.client) {
     const year = new Date().getFullYear();
     console.log('🔍 Buscando no Google para:', opportunityData.client);
     webSearchResults = await searchGoogleForContext(
       `${opportunityData.client} Brasil ${opportunityData.industry || ''} notícias ${year - 1} ${year}`,
       AbortSignal.timeout(AUX_FETCH_TIMEOUT_MS)
     );
   }

   // Profundidade adaptativa: pedidos de análise completa ou modo admin-pipeline → deep
   const wantsDeep = /an[áa]lise (completa|profunda|geral)|plano (completo|de conta)|estrat[ée]gia|diagn[óo]stico/i.test(userInput);
   let depth = wantsDeep ? 'deep' : 'quick';

   // Sem oportunidade selecionada: ajustar contexto por papel
   let effectiveInput = userInput;
   if (!opportunityData && userInput) {
     if (isAdmin && pipelineData?.allOpportunities?.length) {
       depth = 'deep';
       const opps = pipelineData.allOpportunities;
       const byVendor = {};
       opps.forEach(o => {
         const v = o.vendor?.trim() || 'Sem vendedor';
         if (!byVendor[v]) byVendor[v] = [];
         byVendor[v].push(o);
       });

       let pipelineSummary = `[MODO ADMIN — ANÁLISE DE PIPELINE COMPLETO]\nVocê está conversando com ${vendorName}, administrador do CRM.\n`;
       pipelineSummary += `Total: ${opps.length} oportunidades, R$ ${opps.reduce((s,o) => s + (o.value||0), 0).toLocaleString('pt-BR')}\n\n`;

       Object.entries(byVendor).forEach(([vendor, vendorOpps]) => {
         pipelineSummary += `━━ ${vendor} (${vendorOpps.length} opps, R$ ${vendorOpps.reduce((s,o) => s + (o.value||0), 0).toLocaleString('pt-BR')}) ━━\n`;
         vendorOpps.sort((a,b) => (b.value||0) - (a.value||0)).slice(0, 8).forEach(o => {
           const scores = getScaleScores(o.scales);
           const avg = SCALE_KEYS.reduce((s,n) => s + scores[n], 0) / 6;
           const weak = SCALE_KEYS.filter(n => scores[n] <= 3).map(n => n.toUpperCase());
           const strong = SCALE_KEYS.filter(n => scores[n] >= 7).map(n => n.toUpperCase());
           const missing = [];
           if (!o.power_sponsor?.trim()) missing.push('power_sponsor');
           if (!o.next_action?.trim()) missing.push('próxima_ação');
           if (!o.expected_close) missing.push('data_fechamento');

           pipelineSummary += `  • ${o.client} — "${o.name}" — Etapa ${o.stage} — R$ ${(o.value||0).toLocaleString('pt-BR')} — PPVVCC avg ${avg.toFixed(1)}`;
           if (weak.length) pipelineSummary += ` — Fracos: ${weak.join(',')}`;
           if (strong.length) pipelineSummary += ` — Fortes: ${strong.join(',')}`;
           if (missing.length) pipelineSummary += ` — Falta: ${missing.join(',')}`;
           pipelineSummary += `\n`;
         });
         pipelineSummary += '\n';
       });

       pipelineSummary += `Responda com análise concreta usando APENAS os dados acima. Cite nomes reais de clientes e vendedores. Identifique riscos, prioridades e próximos passos. NÃO invente dados.\n\n`;
       effectiveInput = pipelineSummary + userInput;
     } else {
       effectiveInput = `[CONTEXTO: O vendedor NÃO selecionou nenhuma oportunidade no CRM. Responda usando APENAS dados gerais do pipeline fornecidos. NÃO invente nomes de clientes, contatos ou oportunidades. Sugira que selecione uma oportunidade para análise personalizada.]\n\n${userInput}`;
     }
   }

   // PASSO 3: CLAUDE
   const claudeResponse = await callClaudeAPI({
     deadline,
     opportunityData,
     userInput: effectiveInput,
     webSearchResults,
     completeAnalysis,
     activityHistory,
     closedDeals: relevantClosedDeals,
     chatHistory,
     depth
   });

   return new Response(
     JSON.stringify({
       response: claudeResponse.content,
       analysis: completeAnalysis,
       isFallback: claudeResponse.type === 'fallback'
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

// ============= MOTOR DE ANÁLISE COMPLETO =============
function buildCompleteAnalysis(opportunityData, pipelineData, vendorName, activityHistory) {
 const analysis = {
   timestamp: new Date().toISOString(),
   opportunity: null,
   pipeline: null,
   alerts: [],
   nextBestAction: null,
   insights: [],
   relevantCases: []
 };

 if (pipelineData?.allOpportunities) {
   analysis.pipeline = analyzePipelineHealth(pipelineData.allOpportunities);

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

 if (opportunityData) {
   analysis.opportunity = analyzeOpportunity(opportunityData, activityHistory);
   analysis.alerts = generateAlerts(opportunityData, activityHistory);
   analysis.nextBestAction = generateNextBestAction(opportunityData, activityHistory);
   analysis.relevantCases = findRelevantCases(opportunityData);

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

   if (opportunityData.next_action && analysis.opportunity.daysSince > 2) {
     analysis.insights.push({
       type: 'info',
       message: `📋 Ação pendente: "${opportunityData.next_action}"`
     });
   }

   if (opportunityData.expected_close) {
     const daysToClose = Math.floor((new Date(opportunityData.expected_close) - new Date()) / (1000 * 60 * 60 * 24));
     if (daysToClose <= 30 && daysToClose > 0) {
       analysis.insights.push({
         type: 'info',
         message: `📅 Fechamento esperado em ${daysToClose} dias`
       });
     }
   }

   if (analysis.relevantCases.length > 0) {
     const avgRoi = analysis.relevantCases.reduce((sum, c) => sum + (c.resultados.roi_meses || 3), 0) / analysis.relevantCases.length;
     analysis.insights.push({
       type: 'info',
       message: `📚 ${analysis.relevantCases.length} casos similares com ROI médio: ${Math.round(avgRoi)} meses`
     });
   }
 }

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
async function searchGoogleForContext(query, signal) {
 const SERPER_API_KEY = process.env.SERPER_API_KEY;
 if (!SERPER_API_KEY) {
   return null;
 }

 try {
   const response = await fetch('https://google.serper.dev/search', {
     method: 'POST',
     signal,
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

// Assinatura Web ("fetch") do runtime Node da Vercel: recebe Request, devolve Response.
// Um `export default function (req)` no runtime Node é tratado como (req, res) —
// o Response retornado é ignorado e a função fica pendurada até o timeout.
export default { fetch: handler };
