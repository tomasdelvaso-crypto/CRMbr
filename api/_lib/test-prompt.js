// api/_lib/test-prompt.js — smoke test local: node api/_lib/test-prompt.js
import PromptBuilder, { buildStaticSystem } from './promptBuilder.js';

console.log('🧪 Testando PromptBuilder...\n');

const mockOpp = {
  client: 'Empresa Test Ltda',
  industry: 'E-commerce',
  value: 250000,
  stage: 3,
  product: 'BP555 + Fita VENOM 300m',
  power_sponsor: 'João Silva (CFO)',
  sponsor: 'Maria Santos (Gerente Logística)',
  influencer: 'Carlos Souza (Supervisor)',
  next_action: 'Agendar demo técnica'
};

const mockAnalysis = {
  opportunity: {
    healthScore: 6.5,
    probability: 65,
    daysSince: 3,
    scaleBreakdown: {
      dor: 7,
      poder: 5,
      visao: 6,
      valor: 5,
      controle: 8,
      compras: 3
    },
    scaleDescriptions: {
      dor: 'Cliente admite problemas com retrabalho e perdas em transporte',
      poder: 'Temos sponsor mas ainda falta acesso ao CFO',
      valor: 'ROI não foi calculado formalmente'
    }
  },
  alerts: [
    { message: '⚠️ 3 dias sem contato' },
    { message: '📋 Ação pendente: Agendar demo técnica' }
  ],
  relevantCases: [
    {
      empresa: 'Nike Brasil',
      problema: '10% perdas em transporte',
      resultados: { roi_meses: 2, perdas: '100% eliminadas' }
    }
  ]
};

try {
  const system = buildStaticSystem();

  const builder = new PromptBuilder()
    .addOpportunityContext(mockOpp)
    .addScalesAnalysis(mockAnalysis)
    .addContacts(mockOpp)
    .addOperationalInfo(mockOpp)
    .addScaleDescriptions(mockAnalysis)
    .addAlerts(mockAnalysis)
    .addRelevantCases(mockAnalysis.relevantCases)
    .addClosedDealsContext([
      { client: 'Outra E-comm', industry: 'E-commerce', value: 100000, outcome: 'lost', outcome_notes: 'Perdemos por preço; procurement decidiu sem ver a demo' }
    ])
    .addUserQuestion('Como elevar a escala de PODER para conseguir falar com o CFO?')
    .addFinalInstructions('quick');

  const prompt = builder.build();

  console.log('✅ Prompt gerado com sucesso!\n');
  console.log(`📏 System estático: ${system.length} chars (~${Math.ceil(system.length / 4)} tokens, cacheável)`);
  console.log(`📏 Contexto dinâmico: ${prompt.length} chars (~${builder.estimateTokens()} tokens)`);
  console.log(`📦 Seções: ${builder.getSectionCount()}`);

  console.log('\n--- PREVIEW DO CONTEXTO (primeiras 600 chars) ---');
  console.log(prompt.substring(0, 600));
  console.log('...\n');

  const checks = [
    { name: 'System tem definições de escala', pass: system.includes('Tomador de Decisão admite dor') },
    { name: 'System tem etapas do funil', pass: system.includes('Qualificação') },
    { name: 'Contexto tem nome do cliente', pass: prompt.includes('Empresa Test Ltda') },
    { name: 'Contexto tem produto', pass: prompt.includes('BP555') },
    { name: 'Contexto tem contatos', pass: prompt.includes('João Silva') },
    { name: 'Contexto tem nível atual e próximo', pass: prompt.includes('próximo nível') },
    { name: 'Contexto tem alertas', pass: prompt.includes('3 dias sem contato') },
    { name: 'Contexto tem caso relevante', pass: prompt.includes('Nike Brasil') },
    { name: 'Contexto tem deal fechado', pass: prompt.includes('Perdemos por preço') },
    { name: 'Contexto tem pergunta do usuário', pass: prompt.includes('PODER') }
  ];

  console.log('🔍 Validações:');
  checks.forEach(check => {
    console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
  });

  const allPassed = checks.every(c => c.pass);
  process.exit(allPassed ? 0 : 1);

} catch (error) {
  console.error('❌ ERRO:', error.message);
  console.error(error.stack);
  process.exit(1);
}
