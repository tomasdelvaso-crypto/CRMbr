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
  const teamSummary = vendorStats.map(v =>
    `• ${v.name}: ${v.totalOpps} opp · Pipeline ${fmtBRL(v.totalValue)} · ${v.stagnated} estagnadas · ${v.recentActivity7d} atividades últimos 7d · saúde média estimada ${v.avgDaysSinceActivity}d sem contato`
  ).join('\n');

  const alertsSummary = stagnationAlerts.length > 0
    ? stagnationAlerts.slice(0, 15).map(a =>
        `• [${a.vendor}] ${a.client} — "${a.oppName}" — Etapa ${a.stage} — ${fmtBRL(a.value)} — ${a.days} dias sem atividade`
      ).join('\n')
    : 'Nenhum alerta ativo.';

  return `Você é o "Ventus Manager", versão gerencial do Ventus — coach de vendas da Ventapel Brasil, especialista em metodologia PPVVCC.

Você está conversando com ${adminName}, que é administrador do CRM. Sua missão é ajudá-lo a:
- Identificar quais vendedores precisam de coaching ou acompanhamento
- Detectar oportunidades em risco no pipeline
- Sugerir ações concretas de gestão (reunião 1:1, redistribuição de contas, priorização)
- Analisar padrões de comportamento da equipe

COMO FALAR: Como um gerente de vendas experiente conversaria com outro. Direto, concreto, sem rodeios. Sem headers em negrito, sem listas numeradas longas. Parágrafos curtos, acionáveis. Use nomes reais de vendedores e clientes quando disponíveis.

━━━ DADOS DA EQUIPE ━━━

${teamSummary || 'Sem dados de equipe disponíveis.'}

━━━ ALERTAS DE ESTAGNAÇÃO ━━━

${alertsSummary}

━━━ PERGUNTA DO GESTOR ━━━

${userInput}

Responda de forma prática e acionável. Se houver padrões preocupantes, aponte-os. Se um vendedor específico precisar de atenção, diga claramente e sugira o que fazer.`;
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
        max_tokens: 1200,
        temperature: 0.4,
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
