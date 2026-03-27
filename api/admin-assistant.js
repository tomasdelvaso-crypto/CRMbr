// api/admin-assistant.js
// Ventus Manager — assistente exclusivo para admins · gestão de equipe PPVVCC

const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  'Content-Type': 'application/json',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });

// ── Prompt do Ventus Manager ─────────────────────────────────────────────────
function buildAdminPrompt(adminName, vendorStats, stagnationAlerts, userInput) {

  // ── 1. Resumo por vendedor ──
  const teamSummary = vendorStats.map(v =>
    `• ${v.name}: ${v.totalOpps} opp · Pipeline ${fmtBRL(v.totalValue)} · Preenchimento médio ${v.avgCompleteness || '?'}% · Escalas médias ${v.avgScales || '?'}/10 · ${v.stagnated} estagnadas · ${v.recentActivity7d || 0} atividades 7d · ${v.withoutNextAction || 0} sem próxima ação · ${v.withoutContacts || 0} sem contatos`
  ).join('\n');

  // ── 2. Detalhamento por oportunidade ──
  const oppDetails = [];
  vendorStats.forEach(v => {
    (v.opportunities || []).forEach(o => {
      const flags = [];
      if (o.completeness < 50) flags.push('CADASTRO INCOMPLETO');
      if (o.missing?.length > 3) flags.push(`falta: ${o.missing.join(', ')}`);
      if (o.weakScales?.length > 0) flags.push(`escalas fracas: ${o.weakScales.join(', ')}`);
      if (o.strongScales?.length > 0) flags.push(`escalas fortes: ${o.strongScales.join(', ')}`);
      if (!o.hasNextAction) flags.push('SEM PRÓXIMA AÇÃO');
      if (!o.hasContacts) flags.push('SEM CONTATOS');
      if (o.daysSinceActivity >= 14) flags.push(`${o.daysSinceActivity}d sem atividade`);

      oppDetails.push(
        `[${v.name}] ${o.client} — "${o.name}" — Etapa ${o.stage} — ${fmtBRL(o.value)} — Preenchimento ${o.completeness}% — Escalas avg ${o.scaleAvg}/10${flags.length ? ' ⚠ ' + flags.join(' | ') : ' ✓ OK'}`
      );
    });
  });

  // ── 3. Alertas de estagnação ──
  const alertsSummary = stagnationAlerts.length > 0
    ? stagnationAlerts.slice(0, 15).map(a =>
        `• [${a.vendor}] ${a.client} — Etapa ${a.stage} — ${fmtBRL(a.value)} — ${a.days} dias sem atividade`
      ).join('\n')
    : 'Nenhum alerta ativo.';

  // ── 4. Análise automática de pontos fracos / fortes ──
  const allOpps = vendorStats.flatMap(v => (v.opportunities || []).map(o => ({ ...o, vendor: v.name })));

  const weakPoints = [];
  const strongPoints = [];

  // Oportunidades sem contatos-chave
  const noContacts = allOpps.filter(o => !o.hasContacts);
  if (noContacts.length > 0) weakPoints.push(`${noContacts.length} oportunidade(s) sem nenhum contato registrado (Power Sponsor / Sponsor)`);

  // Escalas fracas globais
  const scaleCounter = {};
  allOpps.forEach(o => (o.weakScales || []).forEach(s => { scaleCounter[s] = (scaleCounter[s] || 0) + 1; }));
  Object.entries(scaleCounter).sort((a,b) => b[1]-a[1]).forEach(([scale, count]) => {
    weakPoints.push(`Escala ${scale} é fraca (≤3) em ${count} oportunidade(s) — fraqueza recorrente do time`);
  });

  // Sem próxima ação
  const noAction = allOpps.filter(o => !o.hasNextAction);
  if (noAction.length > 0) weakPoints.push(`${noAction.length} oportunidade(s) sem próxima ação definida — negócios sem direção`);

  // Cadastros incompletos
  const incomplete = allOpps.filter(o => o.completeness < 50);
  if (incomplete.length > 0) weakPoints.push(`${incomplete.length} oportunidade(s) com menos de 50% de preenchimento`);

  // Pontos fortes
  const strongScaleCounter = {};
  allOpps.forEach(o => (o.strongScales || []).forEach(s => { strongScaleCounter[s] = (strongScaleCounter[s] || 0) + 1; }));
  Object.entries(strongScaleCounter).sort((a,b) => b[1]-a[1]).forEach(([scale, count]) => {
    strongPoints.push(`Escala ${scale} é forte (≥7) em ${count} oportunidade(s) — ponto forte do time`);
  });

  const highValue = allOpps.filter(o => (o.value || 0) >= 100000 && o.scaleAvg >= 5);
  if (highValue.length > 0) strongPoints.push(`${highValue.length} oportunidade(s) de alto valor (≥R$100k) com escalas boas — prioridade para fechar`);

  const wellFilled = allOpps.filter(o => o.completeness >= 80);
  if (wellFilled.length > 0) strongPoints.push(`${wellFilled.length} oportunidade(s) com cadastro ≥80% completo — boa disciplina`);

  return `Você é o "Ventus Manager", versão gerencial do Ventus — coach de vendas da Ventapel Brasil, especialista em metodologia PPVVCC.

Você está conversando com ${adminName}, administrador do CRM. Sua missão é ajudá-lo a:
1. QUALIDADE DOS DADOS — Identificar oportunidades mal preenchidas (sem contatos, sem produto, sem próxima ação, escalas zeradas). Explicar POR QUE isso é um problema e O QUE cobrar do vendedor.
2. PONTOS FRACOS — Detectar fraquezas no pipeline: escalas baixas recorrentes (ex: DOR baixa = vendedor não sabe criar urgência), falta de contatos-chave, negócios sem direção.
3. PONTOS FORTES — Identificar o que funciona bem: escalas altas, boa disciplina de preenchimento, oportunidades com momentum. Sugerir como EXPLORAR essas vantagens.
4. COACHING — Sugerir ações concretas: reuniões 1:1 com vendedores específicos, redistribuição de contas, treinamento em escalas fracas.

SIGNIFICADO DAS ESCALAS PPVVCC:
- DOR: O cliente reconhece o problema? Baixa = vendedor não está criando urgência.
- PODER: Falando com o decisor? Baixa = vendedor preso em nível operacional.
- VISÃO: Cliente vê a solução? Baixa = precisa melhorar a apresentação do produto.
- VALOR: ROI quantificado? Baixa = falta business case.
- CONTROLE: Processo mapeado? Baixa = vendedor não sabe os próximos passos internos do cliente.
- COMPRAS: Processo de compra fluindo? Baixa = bloqueios internos no cliente.

COMO FALAR: Como um diretor comercial conversaria com um gerente. Direto, concreto, sem rodeios. Parágrafos curtos e acionáveis. Use nomes reais. Sem markdown headers, sem listas numeradas longas.

━━━ RESUMO POR VENDEDOR ━━━

${teamSummary || 'Sem dados.'}

━━━ DETALHE POR OPORTUNIDADE ━━━

${oppDetails.slice(0, 30).join('\n') || 'Sem dados.'}

━━━ PONTOS FRACOS DETECTADOS ━━━

${weakPoints.length > 0 ? weakPoints.map(p => `🔴 ${p}`).join('\n') : '✅ Nenhum ponto fraco crítico.'}

━━━ PONTOS FORTES DETECTADOS ━━━

${strongPoints.length > 0 ? strongPoints.map(p => `💪 ${p}`).join('\n') : '— Sem destaques.'}

━━━ ALERTAS DE ESTAGNAÇÃO ━━━

${alertsSummary}

━━━ PERGUNTA DO GESTOR ━━━

${userInput}

Responda de forma prática e acionável. Cite nomes de vendedores e clientes. Se há padrões (ex: DOR sempre baixa num vendedor), aponte e sugira coaching específico.`;
}

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

// ── Fallback sem Claude ──────────────────────────────────────────────────────
function fallbackResponse(vendorStats, stagnationAlerts, userInput) {
  const critical = stagnationAlerts.filter(a => a.days >= 30);
  const warning  = stagnationAlerts.filter(a => a.days >= 14 && a.days < 30);

  const worstVendor = vendorStats.sort((a, b) => b.stagnated - a.stagnated)[0];

  let resp = '';

  if (critical.length > 0) {
    resp += `🔴 Situação crítica: ${critical.length} oportunidade${critical.length > 1 ? 's' : ''} sem atividade há mais de 30 dias — ${critical.slice(0, 3).map(a => `${a.client} (${a.vendor})`).join(', ')}.\n\n`;
  }

  if (worstVendor && worstVendor.stagnated > 0) {
    resp += `O vendedor com mais oportunidades paradas é ${worstVendor.name} com ${worstVendor.stagnated} estagnada${worstVendor.stagnated > 1 ? 's' : ''}. Recomendo um 1:1 essa semana para revisar pipeline juntos.\n\n`;
  }

  if (warning.length > 0) {
    resp += `🟠 ${warning.length} oportunidade${warning.length > 1 ? 's' : ''} em zona de atenção (14–30 dias). Acompanhe de perto antes de virarem críticas.`;
  }

  if (!resp) {
    resp = `Pipeline saudável! Nenhum alerta crítico no momento. Continue monitorando a atividade da equipe.`;
  }

  return resp.trim();
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const body = await req.json();
    const { userInput, adminName, vendorStats = [], stagnationAlerts = [] } = body;

    if (!userInput?.trim()) {
      return json({ response: 'Pode me perguntar sobre a equipe — desempenho, alertas, quem precisa de atenção...' });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      console.warn('⚠️ Claude API não configurada, usando fallback gerencial');
      return json({ response: fallbackResponse(vendorStats, stagnationAlerts, userInput) });
    }

    const prompt = buildAdminPrompt(adminName, vendorStats, stagnationAlerts, userInput);

    const clRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1800,
        temperature: 0.35,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!clRes.ok) {
      const errText = await clRes.text().catch(() => '');
      console.error('❌ Claude API error (admin-assistant):', clRes.status, errText);
      return json({ response: fallbackResponse(vendorStats, stagnationAlerts, userInput) });
    }

    const data = await clRes.json();
    const response = data.content?.[0]?.text || 'Sem resposta da IA.';

    if (data.usage) {
      const cost = ((data.usage.input_tokens / 1e6) * 3 + (data.usage.output_tokens / 1e6) * 15).toFixed(4);
      console.log(`💰 [admin-assistant] $${cost} (${data.usage.input_tokens}in + ${data.usage.output_tokens}out)`);
    }

    return json({ response });

  } catch (err) {
    console.error('❌ admin-assistant handler error:', err);
    return json({ response: '❌ Erro interno. Tente novamente em instantes.' }, 500);
  }
}
