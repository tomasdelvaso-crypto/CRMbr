// api/_lib/ppvvcc.js
// Fonte única de verdade da metodologia PPVVCC.
// Usado pelo frontend (src/*) e pelos endpoints de IA (api/*).

export const SCALE_KEYS = ['dor', 'poder', 'visao', 'valor', 'controle', 'compras'];

// Aliases legados (inglês) que ainda podem existir em registros antigos
const SCALE_ALIASES = {
  dor: 'pain',
  poder: 'power',
  visao: 'vision',
  valor: 'value',
  controle: 'control',
  compras: 'purchase',
};

export function getScaleValue(scale) {
  if (scale === null || scale === undefined) return 0;
  if (typeof scale === 'number') return scale;
  if (typeof scale === 'object' && typeof scale.score === 'number') return scale.score;
  return 0;
}

export function getScaleDescription(scale) {
  if (scale && typeof scale === 'object' && scale.description) return scale.description;
  return '';
}

// Lê uma escala pelo nome canônico, aceitando aliases legados
export function getScale(scales, key) {
  if (!scales) return undefined;
  return scales[key] !== undefined ? scales[key] : scales[SCALE_ALIASES[key]];
}

export function getScaleScores(scales) {
  const out = {};
  SCALE_KEYS.forEach(key => {
    out[key] = getScaleValue(getScale(scales, key));
  });
  return out;
}

// Média das 6 escalas, com 1 decimal. Retorna number (usar toFixed(1) na exibição).
export function calculateHealthScore(scales) {
  if (!scales) return 0;
  const scores = SCALE_KEYS.map(key => getScaleValue(getScale(scales, key)));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 10) / 10;
}

// Dias desde o último contato REAL.
// Se houver histórico de atividades, usa a atividade mais recente (data mais confiável);
// senão cai para last_update (que é resetado por qualquer edição do registro).
export function getDaysSinceLastContact(lastUpdate, activityHistory) {
  let reference = null;

  if (Array.isArray(activityHistory) && activityHistory.length > 0) {
    activityHistory.forEach(a => {
      const raw = a?.activity_date || a?.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (!isNaN(d) && (!reference || d > reference)) reference = d;
    });
  }

  if (!reference && lastUpdate) {
    const d = new Date(lastUpdate);
    if (!isNaN(d)) reference = d;
  }

  if (!reference) return 999;
  const days = Math.floor((Date.now() - reference.getTime()) / (1000 * 60 * 60 * 24));
  return days < 0 ? 0 : days;
}

// --- ETAPAS DO FUNIL ---
export const STAGES = [
  {
    id: 1,
    name: 'Prospecção',
    probability: 0,
    requirements: ['Identificar dor do cliente', 'Contato inicial estabelecido'],
  },
  {
    id: 2,
    name: 'Qualificação',
    probability: 20,
    requirements: ['Score DOR ≥ 5', 'Score PODER ≥ 4', 'Budget confirmado'],
  },
  {
    id: 3,
    name: 'Apresentação',
    probability: 40,
    requirements: ['Score VISÃO ≥ 5', 'Apresentação agendada', 'Stakeholders definidos'],
  },
  {
    id: 4,
    name: 'Validação/Teste',
    probability: 60,
    requirements: ['Score VALOR ≥ 6', 'Teste/POC executado', 'ROI validado'],
  },
  {
    id: 5,
    name: 'Negociação',
    probability: 80,
    requirements: ['Score CONTROLE ≥ 7', 'Score COMPRAS ≥ 6', 'Proposta enviada'],
  },
  {
    id: 6,
    name: 'Fechado',
    probability: 100,
    requirements: ['Contrato assinado', 'Pagamento processado'],
  },
];

// Gates de escala mínima para SAIR da etapa (avançar para a seguinte).
// Chave = etapa ATUAL. Ex.: para sair de Qualificação (2), DOR ≥ 5 e PODER ≥ 4.
export const STAGE_GATES = {
  2: [{ scale: 'dor', min: 5 }, { scale: 'poder', min: 4 }],
  3: [{ scale: 'visao', min: 5 }],
  4: [{ scale: 'valor', min: 6 }],
  5: [{ scale: 'controle', min: 7 }, { scale: 'compras', min: 6 }],
};

export function checkStageRequirements(scales, stageId) {
  const gates = STAGE_GATES[stageId];
  if (!gates) return true;
  return gates.every(g => getScaleValue(getScale(scales, g.scale)) >= g.min);
}

// --- DEFINIÇÕES DE NÍVEL DE CADA ESCALA (0-10) ---
export const SCALE_DEFINITIONS = {
  dor: [
    { level: 0, text: 'Não há identificação de necessidade ou dor pelo cliente' },
    { level: 1, text: 'Vendedor assume necessidades do cliente' },
    { level: 2, text: 'Pessoa de Contato admite necessidade' },
    { level: 3, text: 'Pessoa de Contato admite razões e sintomas causadores de dor' },
    { level: 4, text: 'Pessoa de Contato admite dor' },
    { level: 5, text: 'Vendedor documenta dor e Pessoa de Contato concorda' },
    { level: 6, text: 'Pessoa de Contato formaliza necessidades do Tomador de Decisão' },
    { level: 7, text: 'Tomador de Decisão admite necessidades' },
    { level: 8, text: 'Tomador de Decisão admite razões e sintomas causadores de dor' },
    { level: 9, text: 'Tomador de Decisão admite dor' },
    { level: 10, text: 'Vendedor documenta dor e Power concorda' },
  ],
  poder: [
    { level: 0, text: 'Tomador de Decisão não foi identificado ainda' },
    { level: 1, text: 'Processo de decisão revelado por Pessoa de Contato' },
    { level: 2, text: 'Tomador de Decisão Potencial identificado' },
    { level: 3, text: 'Pedido de acesso a Tomador de Decisão acordado por Pessoa de Contato' },
    { level: 4, text: 'Tomador de Decisão acessado' },
    { level: 5, text: 'Tomador de Decisão concorda em explorar oportunidade' },
    { level: 6, text: 'Processo de decisão e compra confirmado pelo Tomador de Decisão' },
    { level: 7, text: 'Tomador de Decisão concorda em fazer uma Prova de Valor' },
    { level: 8, text: 'Tomador de Decisão concorda com conteúdo da proposta' },
    { level: 9, text: 'Tomador de Decisão confirma aprovação verbal' },
    { level: 10, text: 'Tomador de Decisão aprova formalmente internamente' },
  ],
  visao: [
    { level: 0, text: 'Nenhuma visão ou visão concorrente estabelecida' },
    { level: 1, text: 'Visão do Pessoa de Contato criada em termos de produto' },
    { level: 2, text: 'Visão Pessoa de Contato criada em termos: Situação/Problema/Implicação' },
    { level: 3, text: 'Visão diferenciada criada com Pessoa de Contato (SPI)' },
    { level: 4, text: 'Visão diferenciada documentada com Pessoa de Contato' },
    { level: 5, text: 'Documentação concordada por Pessoa de Contato' },
    { level: 6, text: 'Visão Power criada em termos de produto' },
    { level: 7, text: 'Visão Power criada em termos: Situação/Problema/Implicação' },
    { level: 8, text: 'Visão diferenciada criada com Tomador de Decisão (SPIN)' },
    { level: 9, text: 'Visão diferenciada documentada com Tomador de Decisão' },
    { level: 10, text: 'Documentação concordada por Tomador de Decisão' },
  ],
  valor: [
    { level: 0, text: 'Pessoa de Contato explora a solução, mas valor não foi identificado' },
    { level: 1, text: 'Vendedor identifica proposição de valor para o negócio' },
    { level: 2, text: 'Pessoa de Contato concorda em explorar a proposta de valor' },
    { level: 3, text: 'Tomador de Decisão concorda em explorar a proposta de valor' },
    { level: 4, text: 'Critérios para definição de valor estabelecidos com Tomador de Decisão' },
    { level: 5, text: 'Valor descoberto está associado à visão Tomador de Decisão' },
    { level: 6, text: 'Análise de valor conduzida por vendedor (demo)' },
    { level: 7, text: 'Análise de valor conduzida pelo Pessoa de Contato (trial)' },
    { level: 8, text: 'Tomador de Decisão concorda com análise de Valor' },
    { level: 9, text: 'Conclusão da análise de valor documentada pelo vendedor' },
    { level: 10, text: 'Tomador de Decisão confirma por escrito conclusões da análise' },
  ],
  controle: [
    { level: 0, text: 'Nenhum follow documentado de conversa com Pessoa de Contato' },
    { level: 1, text: '1ª visão (SPI) enviada para Pessoa de Contato' },
    { level: 2, text: '1ª visão concordada ou modificada por Pessoa de Contato (SPIN)' },
    { level: 3, text: '1ª visão enviada para Tomador de Decisão (SPI)' },
    { level: 4, text: '1ª visão concordada ou modificada por Tomador de Decisão (SPIN)' },
    { level: 5, text: 'Vendedor recebe aprovação para explorar Valor' },
    { level: 6, text: 'Plano de avaliação enviado para Tomador de Decisão' },
    { level: 7, text: 'Tomador de Decisão concorda ou modifica a Avaliação' },
    { level: 8, text: 'Plano de Avaliação conduzido (quando aplicável)' },
    { level: 9, text: 'Resultado da Avaliação aprovado pelo Tomador de Decisão' },
    { level: 10, text: 'Tomador de Decisão aprova proposta para negociação final' },
  ],
  compras: [
    { level: 0, text: 'Processo de compras desconhecido' },
    { level: 1, text: 'Processo de compras esclarecido pela pessoa de contato' },
    { level: 2, text: 'Processo de compras confirmado pelo Tomador de Decisão' },
    { level: 3, text: 'Condições comerciais validadas com o cliente' },
    { level: 4, text: 'Proposta apresentada para o cliente' },
    { level: 5, text: 'Processo de negociação iniciado com departamento de compras' },
    { level: 6, text: 'Condições comerciais aprovadas e formalizadas' },
    { level: 7, text: 'Contrato assinado' },
    { level: 8, text: 'Pedido de compras recebido' },
    { level: 9, text: 'Cobrança emitida' },
    { level: 10, text: 'Pagamento realizado' },
  ],
};

export const PRODUCT_LINE_LABELS = {
  better_pack: 'Máquinas Better Pack',
  better_pack_venom: 'Better Pack + Venom',
  ecomfill_resmas: 'E-comfill + Resmas',
  ecombag: 'E-Combag',
  servico_manutencao: 'Serviço de Manutenção',
};
