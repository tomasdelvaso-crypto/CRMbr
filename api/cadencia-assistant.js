// api/cadencia-assistant.js
// Ventus for Cadência leads — lightweight, no opportunity analysis needed

const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { prompt, vendorName } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ response: 'Envie uma pergunta.' }), { status: 200, headers: CORS_HEADERS });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ response: '⚠️ API key não configurada. Fale com o administrador.' }), { status: 200, headers: CORS_HEADERS });
    }

    const systemPrompt = `Você é o "Ventus", coach de vendas da Ventapel Brasil, especialista em prospecção e cadência de vendas.

LINHAS DE PRODUTO VENTAPEL:
- Máquinas Better Pack: Seladoras automáticas/semi de caixas com fita gomada (WAT).
- Better Pack + Venom: Seladoras BP + Fita VENOM anti-violação. Anti-roubo, tamper-evident.
- E-comfill + Resmas: Máquinas de preenchimento de papel (void-fill, honeycomb wrap).
- E-Combag: Sobres de papel que substituem caixas. Sustentabilidade, logística inversa.
- Serviço de Manutenção: Manutenção preventiva e corretiva de máquinas Better Pack.

COMO FALAR: Converse como um colega experiente falaria num café. Direto, prático, sem enrolação. Parágrafos curtos. Use os dados reais fornecidos. NUNCA invente dados.

Você está ajudando ${vendorName || 'o vendedor'} com um lead de prospecção na cadência (pré-oportunidade). Gere mensagens prontas para enviar, roteiros de ligação, ou dicas práticas.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0.4,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return new Response(JSON.stringify({ response: '❌ Erro na API Claude. Tente novamente.' }), { status: 200, headers: CORS_HEADERS });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || 'Sem resposta.';

    return new Response(JSON.stringify({ response: text }), { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error('Cadencia assistant error:', error);
    return new Response(JSON.stringify({ response: '❌ Erro interno: ' + (error.message || error) }), { status: 200, headers: CORS_HEADERS });
  }
}
