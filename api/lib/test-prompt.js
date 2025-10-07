// api/lib/test-prompt.js
import PromptBuilder from './promptBuilder.js';

console.log('🧪 Testando PromptBuilder...\n');

// Mock de datos de prueba
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

// Construir prompt
try {
  const prompt = new PromptBuilder()
    .addSystemRole()
    .addOpportunityContext(mockOpp)
    .addScalesAnalysis(mockAnalysis)
    .addContacts(mockOpp)
    .addOperationalInfo(mockOpp)
    .addScaleDescriptions(mockAnalysis)
    .addAlerts(mockAnalysis)
    .addRelevantCases(mockAnalysis.relevantCases)
    .addUserQuestion('Como elevar a escala de PODER para conseguir falar com o CFO?')
    .addFinalInstructions()
    .build();

  console.log('✅ Prompt gerado com sucesso!\n');
  
  // Métricas
  const builder = new PromptBuilder()
    .addSystemRole()
    .addOpportunityContext(mockOpp)
    .addScalesAnalysis(mockAnalysis)
    .addContacts(mockOpp)
    .addOperationalInfo(mockOpp)
    .addScaleDescriptions(mockAnalysis)
    .addAlerts(mockAnalysis)
    .addRelevantCases(mockAnalysis.relevantCases)
    .addUserQuestion('Como elevar a escala de PODER para conseguir falar com o CFO?')
    .addFinalInstructions();
  
  console.log(`📏 Tamanho: ${prompt.length} caracteres`);
  console.log(`📊 Tokens estimados: ${builder.estimateTokens()}`);
  console.log(`📦 Seções: ${builder.getSectionCount()}`);
  
  // Preview
  console.log('\n--- PREVIEW DO PROMPT (primeiras 600 chars) ---');
  console.log(prompt.substring(0, 600));
  console.log('...\n');
  
  // Validações
  const checks = [
    { name: 'Tem DIAGNÓSTICO', pass: prompt.includes('DIAGNÓSTICO') },
    { name: 'Tem nome do cliente', pass: prompt.includes('Empresa Test Ltda') },
    { name: 'Tem produto', pass: prompt.includes('BP555') },
    { name: 'Tem contatos', pass: prompt.includes('João Silva') },
    { name: 'Tem escalas', pass: prompt.includes('DOR: 7/10') },
    { name: 'Tem ação registrada', pass: prompt.includes('Agendar demo') },
    { name: 'Tem alertas', pass: prompt.includes('3 dias sem contato') },
    { name: 'Tem caso relevante', pass: prompt.includes('Nike Brasil') },
    { name: 'Tem pergunta do usuário', pass: prompt.includes('PODER') },
    { name: 'Menos de 2000 tokens', pass: builder.estimateTokens() < 2000 }
  ];
  
  console.log('🔍 Validações:');
  checks.forEach(check => {
    console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
  });
  
  const allPassed = checks.every(c => c.pass);
  
  if (allPassed) {
    console.log('\n🎉 TODOS OS TESTES PASSARAM!');
    console.log('\n💰 Economia estimada:');
    console.log(`   Antes: ~2500 tokens = $0.012/request`);
    console.log(`   Agora: ~${builder.estimateTokens()} tokens = $${(builder.estimateTokens() * 3 / 1000000 + builder.estimateTokens() * 0.5 * 15 / 1000000).toFixed(4)}/request`);
    console.log(`   Ahorro: ~${Math.round((1 - builder.estimateTokens()/2500) * 100)}%`);
    process.exit(0);
  } else {
    console.log('\n❌ ALGUNS TESTES FALHARAM');
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ ERRO:', error.message);
  console.error(error.stack);
  process.exit(1);
}
